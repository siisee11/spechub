import { expect, test } from "bun:test";

import type { SymphonyConfig } from "./lib/config.mts";
import type { NormalizedIssue } from "./lib/linear.mts";
import { SymphonyOrchestrator, shouldDispatchIssue, sortIssuesForDispatch } from "./lib/orchestrator.mts";
import type { WorkerController, WorkerFactory } from "./lib/runtime.mts";

function createConfig(): SymphonyConfig {
  return {
    workflowPath: "/repo/WORKFLOW.md",
    promptTemplate: "prompt",
    tracker: {
      kind: "linear",
      endpoint: "https://linear.test/graphql",
      apiKey: "token",
      projectSlug: "app",
      activeStates: ["Todo", "In Progress"],
      terminalStates: ["Done"],
      activeStateSet: new Set(["todo", "in progress"]),
      terminalStateSet: new Set(["done"]),
    },
    polling: { intervalMs: 30000 },
    workspace: { root: "/tmp/workspaces" },
    hooks: { timeoutMs: 1000 },
    agent: {
      maxConcurrentAgents: 2,
      maxTurns: 3,
      maxRetryBackoffMs: 300000,
      maxConcurrentAgentsByState: { "in progress": 1 },
    },
    codex: {
      command: "codex app-server",
      approvalPolicy: "never",
      threadSandbox: "workspace-write",
      turnSandboxPolicy: { type: "workspace-write" },
      turnTimeoutMs: 1000,
      readTimeoutMs: 1000,
      stallTimeoutMs: 1000,
    },
    server: {},
  };
}

function createIssue(overrides?: Partial<NormalizedIssue>): NormalizedIssue {
  return {
    id: "1",
    identifier: "ABC-1",
    title: "Issue",
    description: null,
    priority: 2,
    state: "Todo",
    branch_name: null,
    url: null,
    labels: [],
    blocked_by: [],
    created_at: "2026-03-10T00:00:00Z",
    updated_at: null,
    ...overrides,
  };
}

function createScheduler() {
  const timers = new Map<unknown, () => void>();
  let nextId = 1;
  return {
    scheduler: {
      setTimeout(fn: () => void) {
        const id = nextId++;
        timers.set(id, fn);
        return id;
      },
      clearTimeout(handle: unknown) {
        timers.delete(handle);
      },
    },
    fire(handle: unknown) {
      timers.get(handle)?.();
    },
  };
}

test("dispatch rules and sorting honor blockers and priority", () => {
  const config = createConfig();
  const issue = createIssue({
    blocked_by: [{ id: "2", identifier: "ABC-2", state: "In Progress" }],
  });
  const dispatchable = createIssue({ id: "2", identifier: "ABC-2", priority: 1 });
  const later = createIssue({ id: "3", identifier: "ABC-3", priority: null });
  const state = {
    running: new Map(),
    claimed: new Set(),
  } as unknown as SymphonyOrchestrator["state"];

  expect(shouldDispatchIssue(issue, state, config)).toBe(false);
  expect(sortIssuesForDispatch([later, dispatchable]).map((entry) => entry.identifier)).toEqual([
    "ABC-2",
    "ABC-3",
  ]);
});

test("orchestrator schedules retries for completed, failed, stalled, and terminal runs", async () => {
  const config = createConfig();
  const scheduler = createScheduler();
  const cancellations: string[] = [];
  const removed: string[] = [];
  const controllers = new Map<string, { controller: WorkerController; emit: (status: "completed" | "failed" | "cancelled") => void }>();
  const workerFactory: WorkerFactory = ({ issue, onEvent }) => {
    let resolve!: (value: { status: "completed" | "failed" | "cancelled"; error?: string }) => void;
    const controller = {
      result: new Promise((innerResolve) => {
        resolve = innerResolve;
      }),
      cancel: async (reason: string) => {
        cancellations.push(reason);
        resolve({ status: "cancelled", error: reason });
      },
    };
    controllers.set(issue.id, {
      controller,
      emit: (status) => {
        onEvent({
          event: "thread_tokenUsage_updated",
          timestampMs: 100,
          turnId: "turn-1",
          usage: { inputTokens: 5, outputTokens: 3, totalTokens: 8 },
        });
        resolve({ status, error: status === "failed" ? "boom" : undefined });
      },
    });
    return controller;
  };

  const orchestrator = new SymphonyOrchestrator({
    getConfig: () => config,
    tracker: {
      fetchCandidateIssues: async () => [createIssue()],
      fetchIssuesByStates: async () => [],
      fetchIssueStatesByIds: async (ids) =>
        ids.includes("3") ? [createIssue({ id: "3", identifier: "ABC-3", state: "Done" })] : [],
    },
    workerFactory,
    workspaceRemover: async (identifier) => {
      removed.push(identifier);
    },
    scheduler: scheduler.scheduler,
    now: (() => {
      let current = 0;
      return () => current;
    })(),
  });

  orchestrator.dispatchIssue(createIssue(), null, config);
  controllers.get("1")?.emit("completed");
  await Promise.resolve();
  const completionRetry = orchestrator.state.retryAttempts.get("1");
  expect(completionRetry?.attempt).toBe(1);

  orchestrator.dispatchIssue(createIssue({ id: "2", identifier: "ABC-2" }), 1, config);
  controllers.get("2")?.emit("failed");
  await Promise.resolve();
  expect(orchestrator.state.retryAttempts.get("2")?.attempt).toBe(2);

  orchestrator.dispatchIssue(createIssue({ id: "3", identifier: "ABC-3", state: "In Progress" }), null, config);
  await orchestrator.reconcileRunningIssues({
    ...config,
    codex: { ...config.codex, stallTimeoutMs: 0 },
  });
  await Promise.resolve();
  expect(cancellations).toContain("terminal");
  expect(removed).toEqual(["ABC-3"]);

  let nowMs = 0;
  const stallOrchestrator = new SymphonyOrchestrator({
    getConfig: () => config,
    tracker: {
      fetchCandidateIssues: async () => [],
      fetchIssuesByStates: async () => [],
      fetchIssueStatesByIds: async () => [],
    },
    workerFactory,
    workspaceRemover: async () => {},
    scheduler: scheduler.scheduler,
    now: () => nowMs,
  });
  stallOrchestrator.dispatchIssue(createIssue({ id: "4", identifier: "ABC-4", state: "In Progress" }), null, config);
  nowMs = 5000;
  await stallOrchestrator.reconcileRunningIssues(config);
  await Promise.resolve();
  expect(cancellations).toContain("stalled");
});

test("orchestrator snapshot reports live totals and retry rows", async () => {
  const config = createConfig();
  let nowMs = 1000;
  let emitEvent!: (event: { turnId: string }) => void;
  const orchestrator = new SymphonyOrchestrator({
    getConfig: () => config,
    tracker: {
      fetchCandidateIssues: async () => [],
      fetchIssuesByStates: async () => [],
      fetchIssueStatesByIds: async () => [],
    },
    workerFactory: ({ onEvent }) => {
      emitEvent = ({ turnId }) =>
        onEvent({
          event: "thread_tokenUsage_updated",
          timestampMs: 1000,
          turnId,
          usage: { inputTokens: 10, outputTokens: 4, totalTokens: 14 },
        });
      return {
        result: new Promise(() => {}),
        cancel: () => {},
      };
    },
    workspaceRemover: async () => {},
    now: () => nowMs,
  });

  orchestrator.dispatchIssue(createIssue(), null, config);
  emitEvent({ turnId: "turn-1" });
  emitEvent({ turnId: "turn-1" });
  nowMs = 5000;
  const snapshot = orchestrator.snapshot();

  expect(snapshot.running[0]?.turn_count).toBe(1);
  expect(snapshot.codex_totals.total_tokens).toBe(14);
  expect(snapshot.codex_totals.seconds_running).toBe(4);
});

test("orchestrator emits terminal logs for tick, dispatch, worker events, and retry", async () => {
  const config = createConfig();
  const logs: string[] = [];
  const scheduler = createScheduler();
  let resolveRun!: (value: { status: "completed"; error?: string }) => void;
  let emitEvent!: () => void;

  const workerFactory: WorkerFactory = ({ onEvent }) => ({
    result: new Promise((resolve) => {
      emitEvent = () => {
        onEvent({
          event: "worker_phase",
          timestampMs: 100,
          message: "setup phase",
        });
        onEvent({
          event: "notification",
          timestampMs: 200,
          turnId: "turn-1",
          message: "Working",
        });
      };
      resolveRun = resolve as (value: { status: "completed"; error?: string }) => void;
    }),
    cancel: async () => {},
  });

  const loggingOrchestrator = new SymphonyOrchestrator({
    getConfig: () => config,
    tracker: {
      fetchCandidateIssues: async () => [createIssue()],
      fetchIssuesByStates: async () => [],
      fetchIssueStatesByIds: async () => [],
    },
    workerFactory,
    workspaceRemover: async () => {},
    scheduler: scheduler.scheduler,
    log: (line) => logs.push(line),
  });

  await loggingOrchestrator.tick();
  emitEvent();
  resolveRun({ status: "completed" });
  await Promise.resolve();

  expect(logs.some((line) => line.includes("action=tick outcome=begin"))).toBe(true);
  expect(logs.some((line) => line.includes("action=dispatch outcome=running"))).toBe(true);
  expect(logs.some((line) => line.includes("action=worker_event outcome=observed"))).toBe(true);
  expect(logs.some((line) => line.includes("action=retry_schedule outcome=queued"))).toBe(true);
});
