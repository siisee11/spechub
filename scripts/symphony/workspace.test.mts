import { mkdir, writeFile } from "node:fs/promises";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";

import { expect, test } from "bun:test";

import {
  assertWorkspaceWithinRoot,
  resolveWorkspacePath,
  sanitizeWorkspaceKey,
  WorkspaceManager,
  type CommandResult,
} from "./lib/workspace.mts";

test("workspace helpers sanitize keys and enforce containment", () => {
  expect(sanitizeWorkspaceKey("ABC/1:?")).toBe("ABC_1__");
  expect(resolveWorkspacePath("/tmp/root", "ABC/1")).toBe("/tmp/root/ABC_1");
  expect(() => assertWorkspaceWithinRoot("/tmp/root", "/tmp/elsewhere")).toThrow();
});

test("workspace manager creates worktree once and runs hooks", async () => {
  const dir = await mkdtemp(`${tmpdir()}/symphony-workspace-`);
  const commands: string[][] = [];
  const runner = async (options: { cmd: string[]; cwd: string; timeoutMs: number }): Promise<CommandResult> => {
    commands.push(options.cmd);
    if (options.cmd.includes("show-ref")) {
      return { code: 1, stdout: "", stderr: "", timedOut: false };
    }
    if (options.cmd.includes("worktree") && options.cmd.includes("add")) {
      const workspacePath = options.cmd.at(-2);
      await mkdir(String(workspacePath), { recursive: true });
    }
    return { code: 0, stdout: "", stderr: "", timedOut: false };
  };
  const manager = new WorkspaceManager({
    repoRoot: dir,
    workspaceRoot: `${dir}/workspaces`,
    hooks: {
      afterCreate: "echo created",
      beforeRun: "echo before",
      afterRun: "echo after",
      beforeRemove: "echo remove",
      timeoutMs: 1000,
    },
    runCommand: runner,
  });

  const first = await manager.ensureWorkspace("ABC-1");
  const second = await manager.ensureWorkspace("ABC-1");
  await manager.runHook("before_run", first.path, true);
  await manager.runHook("after_run", first.path, false);

  expect(first.createdNow).toBe(true);
  expect(second.createdNow).toBe(false);
  expect(commands.filter((cmd) => cmd.includes("worktree") && cmd.includes("add"))).toHaveLength(1);
  expect(commands.filter((cmd) => cmd[0] === "bash")).toHaveLength(3);
});

test("workspace manager removes directories even if git worktree removal fails", async () => {
  const dir = await mkdtemp(`${tmpdir()}/symphony-remove-`);
  const workspaceRoot = `${dir}/workspaces`;
  const workspacePath = `${workspaceRoot}/ABC-1`;
  await mkdir(workspacePath, { recursive: true });
  await writeFile(`${workspacePath}/file.txt`, "hello");
  const manager = new WorkspaceManager({
    repoRoot: dir,
    workspaceRoot,
    hooks: {
      timeoutMs: 1000,
    },
    runCommand: async () => ({ code: 1, stdout: "", stderr: "", timedOut: false }),
  });

  await manager.removeWorkspace("ABC-1");

  expect(await Bun.file(`${workspacePath}/file.txt`).exists()).toBe(false);
});
