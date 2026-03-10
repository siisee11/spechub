import { expect, test } from "bun:test";

import type { SymphonyConfig } from "./lib/config.mts";
import { createLinearLifecycleWriter } from "./lib/linear-writer.mts";
import type { NormalizedIssue } from "./lib/linear.mts";

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
    linear: {
      dispatch: {
        assignee: "viewer",
        state: "In Progress",
        comment: "Started {{ issue.identifier }} attempt {{ attempt }}",
      },
      completion: {
        comment: "PR {{ result.pr_url }}",
      },
      failure: {
        comment: "Failed {{ issue.identifier }}: {{ error }}",
      },
    },
  };
}

function createIssue(): NormalizedIssue {
  return {
    id: "issue-1",
    identifier: "ABC-1",
    title: "Issue",
    description: null,
    priority: 1,
    state: "Todo",
    team_id: "team-1",
    branch_name: null,
    url: null,
    labels: [],
    blocked_by: [],
    created_at: null,
    updated_at: null,
  };
}

test("linear lifecycle writer applies dispatch, completion, and failure actions", async () => {
  const calls: string[] = [];
  const writer = createLinearLifecycleWriter({
    updateIssue: async (options) => {
      calls.push(`update:${JSON.stringify(options)}`);
    },
    createComment: async (options) => {
      calls.push(`comment:${options.body}`);
    },
    getViewer: async () => ({ id: "user-1" }),
    resolveWorkflowStateId: async ({ teamId, stateName }) =>
      teamId === "team-1" && stateName === "In Progress" ? "state-1" : null,
  });
  const config = createConfig();
  const issue = createIssue();

  await writer.onDispatch?.({
    issue,
    attempt: 2,
    config,
  });
  await writer.onCompleted?.({
    issue,
    attempt: 2,
    config,
    result: {
      status: "completed",
      prUrl: "https://github.com/acme/repo/pull/42",
      prAgentOutput: "Opened PR",
    },
  });
  await writer.onFailed?.({
    issue,
    attempt: 3,
    config,
    result: {
      status: "failed",
      error: "boom",
    },
  });

  expect(calls).toEqual([
    'update:{"issueId":"issue-1","stateId":"state-1","assigneeId":"user-1"}',
    "comment:Started ABC-1 attempt 2",
    'update:{"issueId":"issue-1"}',
    "comment:PR https://github.com/acme/repo/pull/42",
    'update:{"issueId":"issue-1"}',
    "comment:Failed ABC-1: boom",
  ]);
});
