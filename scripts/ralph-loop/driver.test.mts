import { mkdtemp, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";

import { expect, test } from "bun:test";

import { runCodingPhase, runPrPhase, runRalphLoop, runSetupPhase } from "./lib/driver.mts";
import type { TurnResult } from "./lib/codex-client.mts";

type FakeSession = {
  startThread: (options: {
    model: string;
    cwd: string;
    approvalPolicy: string;
    sandbox: string;
  }) => Promise<string>;
  runTurn: (options: {
    threadId: string;
    prompt: string;
    cwd: string;
    approvalPolicy: string;
    sandbox: string;
  }) => Promise<TurnResult>;
  compactThread: (threadId: string) => Promise<void>;
  close: () => Promise<void>;
  compacted: string[];
  prompts: string[];
};

function createFakeSession(turns: TurnResult[]): FakeSession {
  return {
    prompts: [],
    compacted: [],
    async startThread() {
      return "thr_test";
    },
    async runTurn(options) {
      this.prompts.push(options.prompt);
      const next = turns.shift();
      if (!next) {
        throw new Error("unexpected extra turn");
      }
      return next;
    },
    async compactThread(threadId) {
      this.compacted.push(threadId);
    },
    async close() {},
  };
}

test("setup phase extracts init output and absolute plan path", async () => {
  const worktreePath = await mkdtemp(`${tmpdir()}/spechub-setup-`);
  await mkdir(`${worktreePath}/docs/exec-plans/active`, { recursive: true });
  await Bun.write(
    `${worktreePath}/docs/exec-plans/active/task.md`,
    "# plan\n",
  );
  const session = createFakeSession([
    {
      turnId: "turn_setup",
      status: "completed",
      agentText: `Created ${worktreePath}/docs/exec-plans/active/task.md\n<promise>COMPLETE</promise>`,
      items: [
        {
          type: "commandExecution",
          aggregatedOutput:
            `{"worktree_id":"wt-1","worktree_path":"${worktreePath}","work_branch":"ralph/task","base_branch":"main","deps_installed":true,"build_verified":true,"runtime_root":".worktree/wt-1"}`,
        },
      ],
    },
  ]);

  const result = await runSetupPhase(session, {
    task: "Task",
    model: "gpt-5.3-codex",
    baseBranch: "main",
    workBranch: "ralph/task",
    repoRoot: "/repo",
    expectedPlanPath: "docs/exec-plans/active/task.md",
    approvalPolicy: "never",
    sandbox: "workspace-write",
  });

  expect(result.planFilePath).toBe(`${worktreePath}/docs/exec-plans/active/task.md`);
  expect(result.initOutput.worktree_id).toBe("wt-1");
});

test("setup phase falls back to inferred init output when setup emits only a plan path", async () => {
  const repoRoot = await mkdtemp(`${tmpdir()}/spechub-repo-`);
  await mkdir(`${repoRoot}/docs/exec-plans/active`, { recursive: true });
  await Bun.write(
    `${repoRoot}/docs/exec-plans/active/task.md`,
    "# plan\n",
  );
  const session = createFakeSession([
    {
      turnId: "turn_setup",
      status: "completed",
      agentText: "docs/exec-plans/active/task.md\n<promise>COMPLETE</promise>",
      items: [],
    },
  ]);

  const result = await runSetupPhase(session, {
    task: "Task",
    model: "gpt-5.3-codex",
    baseBranch: "main",
    workBranch: "ralph/task",
    repoRoot,
    expectedPlanPath: "docs/exec-plans/active/task.md",
    approvalPolicy: "never",
    sandbox: "workspace-write",
  });

  expect(result.planFilePath).toBe(`${repoRoot}/docs/exec-plans/active/task.md`);
  expect(result.initOutput.worktree_path).toBe(repoRoot);
  expect(result.initOutput.runtime_root).toBe(".worktree");
  expect(result.initOutput.work_branch).toBe("ralph/task");
});

test("coding phase compacts on context overflow and stops on completion", async () => {
  const session = createFakeSession([
    {
      turnId: "turn_1",
      status: "failed",
      agentText: "",
      items: [],
      error: {
        message: "too much context",
        codexErrorInfo: "ContextWindowExceeded",
      },
    },
    {
      turnId: "turn_2",
      status: "completed",
      agentText: "<promise>COMPLETE</promise>",
      items: [],
    },
  ]);

  const iterations = await runCodingPhase(session, {
    task: "Task",
    model: "gpt-5.3-codex",
    worktreePath: "/tmp/worktree",
    planFilePath: "/tmp/worktree/docs/exec-plans/active/task.md",
    approvalPolicy: "never",
    sandbox: "workspace-write",
    maxIterations: 3,
  });

  expect(iterations).toBe(2);
  expect(session.compacted).toEqual(["thr_test"]);
});

test("pr phase requires completion signal", async () => {
  const session = createFakeSession([
    {
      turnId: "turn_pr",
      status: "completed",
      agentText: "https://github.com/example/pull/1\n<promise>COMPLETE</promise>",
      items: [],
    },
  ]);

  const output = await runPrPhase(session, {
    model: "gpt-5.3-codex",
    worktreePath: "/tmp/worktree",
    planFilePath: "/tmp/worktree/docs/exec-plans/active/task.md",
    baseBranch: "main",
    approvalPolicy: "never",
    sandbox: "workspace-write",
  });

  expect(output).toContain("https://github.com/example/pull/1");
});

test("full loop wires phases together and exposes runtime root", async () => {
  const worktreePath = await mkdtemp(`${tmpdir()}/spechub-loop-`);
  await mkdir(`${worktreePath}/docs/exec-plans/active`, { recursive: true });
  await Bun.write(
    `${worktreePath}/docs/exec-plans/active/2026-03-09-task.md`,
    "# plan\n",
  );
  const setupSession = createFakeSession([
    {
      turnId: "turn_setup",
      status: "completed",
      agentText: "docs/exec-plans/active/missing.md\n<promise>COMPLETE</promise>",
      items: [
        {
          type: "commandExecution",
          aggregatedOutput:
            `{"worktree_id":"wt-1","worktree_path":"${worktreePath}","work_branch":"ralph/task","base_branch":"main","deps_installed":true,"build_verified":true,"runtime_root":".worktree/wt-1"}`,
        },
      ],
    },
  ]);
  const codingSession = createFakeSession([
    {
      turnId: "turn_code",
      status: "completed",
      agentText: "<promise>COMPLETE</promise>",
      items: [],
    },
  ]);
  const prSession = createFakeSession([
    {
      turnId: "turn_pr",
      status: "completed",
      agentText: "PR ready\n<promise>COMPLETE</promise>",
      items: [],
    },
  ]);
  const sessions = [setupSession, codingSession, prSession];
  const progress: string[] = [];
  const runtimeRoots: string[] = [];

  const outcome = await runRalphLoop(
    {
      task: "Task",
      repoRoot: "/repo",
      model: "gpt-5.3-codex",
      baseBranch: "main",
      maxIterations: 2,
      approvalPolicy: "never",
      sandbox: "workspace-write",
      onProgress: (phase) => progress.push(phase),
      onRuntimeRoot: (root) => runtimeRoots.push(root),
    },
    async () => {
      const next = sessions.shift();
      if (!next) {
        throw new Error("no session available");
      }
      return next;
    },
  );

  expect(outcome.runtimeRoot).toBe(`${worktreePath}/.worktree/wt-1`);
  expect(outcome.planFilePath).toBe(`${worktreePath}/docs/exec-plans/active/2026-03-09-task.md`);
  expect(runtimeRoots).toEqual([`${worktreePath}/.worktree/wt-1`]);
  expect(progress).toEqual(["setup phase", "coding phase", "pr phase"]);
});
