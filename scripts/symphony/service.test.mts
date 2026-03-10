import { expect, test } from "bun:test";

import { SymphonyService } from "./lib/service.mts";
import type { SymphonyConfig } from "./lib/config.mts";

function createConfig(): SymphonyConfig {
  return {
    workflowPath: "/repo/WORKFLOW.md",
    promptTemplate: "prompt",
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
      maxTurns: 3,
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
    linear: {},
  };
}

test("service logs startup, reload, scheduling, and stop", async () => {
  const logs: string[] = [];
  const watchedPaths: string[] = [];
  const calls: string[] = [];
  const config = createConfig();
  let tickCount = 0;

  const service = new SymphonyService({
    repoRoot: "/repo",
    model: "gpt-5.3-codex",
    baseBranch: "main",
    logger: (line) => logs.push(line),
    loadWorkflow: async () => ({
      path: config.workflowPath,
      config: {
        tracker: {
          kind: "linear",
          api_key: "$LINEAR_API_KEY",
          project_slug: "app",
        },
      },
      promptTemplate: "prompt",
    }),
    watchWorkflowFactory: (path, _onChange) => {
      watchedPaths.push(path);
      return {
        close() {
          calls.push("watch_closed");
        },
      };
    },
    createOrchestrator: () =>
      ({
        state: { pollIntervalMs: 30000 },
        async startup() {
          calls.push("startup");
        },
        async tick() {
          tickCount += 1;
          calls.push("tick");
        },
        async stop() {
          calls.push("stop");
        },
      }) as never,
  });

  await service.start();
  await new Promise((resolve) => setTimeout(resolve, 5));
  await service.stop();

  expect(watchedPaths).toEqual(["/repo/WORKFLOW.md"]);
  expect(calls).toContain("startup");
  expect(tickCount).toBeGreaterThan(0);
  expect(calls).toContain("stop");
  expect(calls).toContain("watch_closed");
  expect(logs.some((line) => line.includes("action=reload_workflow outcome=completed"))).toBe(true);
  expect(logs.some((line) => line.includes("action=service_start outcome=completed"))).toBe(true);
  expect(logs.some((line) => line.includes("action=schedule_tick outcome=queued"))).toBe(true);
  expect(logs.some((line) => line.includes("action=service_stop outcome=completed"))).toBe(true);
});
