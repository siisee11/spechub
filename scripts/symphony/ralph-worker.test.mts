import { expect, test } from "bun:test";

import { createRalphSession, createRalphWorker, notificationToWorkerEvent } from "./lib/ralph-worker.mts";
import type { SymphonyConfig } from "./lib/config.mts";

const config: SymphonyConfig = {
  workflowPath: "/repo/WORKFLOW.md",
  promptTemplate: "Issue {{ issue.identifier }} attempt {{ attempt }}",
  tracker: {
    kind: "linear",
    endpoint: "https://linear.test/graphql",
    apiKey: "token",
    projectSlug: "app",
    activeStates: ["Todo"],
    terminalStates: ["Done"],
    activeStateSet: new Set(["todo"]),
    terminalStateSet: new Set(["done"]),
  },
  polling: { intervalMs: 30000 },
  workspace: { root: "/tmp/workspaces" },
  hooks: { timeoutMs: 1000 },
  agent: {
    maxConcurrentAgents: 2,
    maxTurns: 2,
    maxRetryBackoffMs: 300000,
    maxConcurrentAgentsByState: {},
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

test("ralph worker renders prompt, runs hooks, and supports cancellation", async () => {
  const phases: string[] = [];
  const worker = createRalphWorker({
    getWorkspaceManager: () =>
      ({
        ensureWorkspace: async () => ({
          path: "/tmp/workspace",
          workspaceKey: "ABC-1",
          createdNow: true,
        }),
        runHook: async (name: string) => {
          phases.push(name);
        },
      }) as never,
    model: "gpt-5.3-codex",
    baseBranch: "main",
    runLoop: async (options) => {
      phases.push(options.task);
      if (options.signal?.aborted) {
        throw new Error("aborted");
      }
      await new Promise((_, reject) => {
        options.signal?.addEventListener("abort", () => reject(new Error("aborted")), {
          once: true,
        });
      });
      return {
        workBranch: "branch",
        worktreePath: "/tmp/workspace",
        runtimeRoot: "/tmp/workspace/.worktree",
        planFilePath: "/tmp/workspace/docs/exec-plans/active/task.md",
        prAgentOutput: "",
        iterations: 1,
      };
    },
  });

  const controller = worker({
    issue: {
      id: "1",
      identifier: "ABC-1",
      title: "Issue",
      description: null,
      priority: 1,
      state: "Todo",
      branch_name: null,
      url: null,
      labels: [],
      blocked_by: [],
      created_at: null,
      updated_at: null,
    },
    attempt: 2,
    config,
    onEvent: () => {},
  });
  await controller.cancel("terminal");
  const result = await controller.result;

  expect(phases).toContain("before_run");
  expect(phases).toContain("after_run");
  expect(phases.some((phase) => phase.includes("Issue ABC-1 attempt 2"))).toBe(true);
  expect(result.status).toBe("cancelled");
});

test("ralph session wrapper maps runTurn results and raw notifications", async () => {
  const emitted: Array<Record<string, unknown>> = [];
  const session = await createRalphSession({
    cwd: "/tmp/workspace",
    config,
    onEvent: (event) => emitted.push(event),
    connect: async (options) => {
      options?.onNotification?.({
        method: "thread/tokenUsage/updated",
        params: {
          total_token_usage: {
            input_tokens: 3,
            output_tokens: 2,
            total_tokens: 5,
          },
          turnId: "turn-1",
        },
      });
      return {
        startThread: async () => "thread-1",
        runTurn: async () => ({
          turnId: "turn-1",
          status: "completed",
          agentText: "done",
          items: [],
        }),
        compactThread: async () => {},
        close: async () => {},
      } as never;
    },
  });

  const threadId = await session.startThread({
    model: "gpt-5.3-codex",
    cwd: "/tmp/workspace",
    approvalPolicy: "never",
    sandbox: "workspace-write",
  });
  await session.runTurn({
    threadId,
    prompt: "hello",
    cwd: "/tmp/workspace",
    approvalPolicy: "never",
    sandbox: "workspace-write",
  });

  expect(emitted[0]?.usage).toEqual({
    inputTokens: 3,
    outputTokens: 2,
    totalTokens: 5,
  });
  expect(emitted[1]?.sessionId).toBe("thread-1-turn-1");
});

test("notification mapping extracts message and ignores empty payloads", () => {
  expect(
    notificationToWorkerEvent({
      method: "item/completed",
      params: {
        item: {
          type: "agentMessage",
          text: "Working on tests",
          turnId: "turn-1",
        },
      },
    }),
  ).toMatchObject({
    event: "notification",
    turnId: "turn-1",
    message: "Working on tests",
  });
  expect(notificationToWorkerEvent({ method: "noop" })).toBeNull();
});
