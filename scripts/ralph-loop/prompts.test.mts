import { expect, test } from "bun:test";

import { buildCodingPrompt } from "./lib/coding-loop.mts";
import { buildPrPrompt } from "./lib/pr-agent.mts";
import { buildSetupPrompt } from "./lib/setup-agent.mts";
import { parseInitOutput, slugifyPrompt } from "./lib/worktree.mts";

test("setup prompt includes branch inputs", () => {
  const prompt = buildSetupPrompt({
    task: "Implement the harness",
    baseBranch: "main",
    workBranch: "ralph/implement-the-harness",
  });
  expect(prompt).toContain("--base-branch main");
  expect(prompt).toContain("--work-branch ralph/implement-the-harness");
});

test("coding prompt points to the plan file", () => {
  expect(buildCodingPrompt("Task", "docs/exec-plans/active/task.md")).toContain("task.md");
});

test("pr prompt includes base branch", () => {
  expect(buildPrPrompt("docs/exec-plans/completed/task.md", "main")).toContain("main..HEAD");
});

test("init output parser validates required fields", () => {
  const parsed = parseInitOutput(
    JSON.stringify({
      worktree_id: "spechub-123",
      worktree_path: "/tmp/spechub",
      work_branch: "task",
      base_branch: "main",
      deps_installed: true,
      build_verified: true,
      runtime_root: ".worktree/spechub-123",
    }),
  );
  expect(parsed.worktree_id).toBe("spechub-123");
  expect(slugifyPrompt("Build PRD.md first")).toBe("build-prd-md-first");
});
