import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";

import { expect, test } from "bun:test";

const repoRoot = process.cwd();
const harnessSpecRoot = join(repoRoot, "specs", "harness-spec");

async function listFiles(root: string, relative = ""): Promise<string[]> {
  const current = join(root, relative);
  const entries = await readdir(current, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    const entryRelative = relative === "" ? entry.name : join(relative, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await listFiles(root, entryRelative)));
      continue;
    }
    files.push(entryRelative.replaceAll("\\", "/"));
  }

  return files.sort();
}

async function listGitDirectories(root: string, relative = ""): Promise<string[]> {
  const current = join(root, relative);
  const entries = await readdir(current, { withFileTypes: true });
  const gitDirs: string[] = [];

  for (const entry of entries) {
    if (!entry.isDirectory()) {
      continue;
    }
    const entryRelative = relative === "" ? entry.name : join(relative, entry.name);
    if (entry.name === ".git") {
      gitDirs.push(entryRelative.replaceAll("\\", "/"));
      continue;
    }
    gitDirs.push(...(await listGitDirectories(root, entryRelative)));
  }

  return gitDirs.sort();
}

test("harness-spec import contains the expected vendored file set", async () => {
  const files = await listFiles(harnessSpecRoot);

  expect(files).toEqual([
    "1_harness_structure.md",
    "2_execution-env-setup.md",
    "3_observability-stack-setup.md",
    "4_enforce-invariants.md",
    "5_recurring-cleanup.md",
    "6_ralph-loop.md",
    "7_implement-harness-audit.md",
    "SPEC.md",
    "UPSTREAM.md",
    "harness-scaffolding-checklist.md",
    "metadata.json",
    "references/codex-app-server-llm.txt",
    "references/scripts/ralph-loop/lib/cli-options.mts",
    "references/scripts/ralph-loop/lib/codex-client.mts",
    "references/scripts/ralph-loop/lib/coding-loop.mts",
    "references/scripts/ralph-loop/lib/completion.mts",
    "references/scripts/ralph-loop/lib/pr-agent.mts",
    "references/scripts/ralph-loop/lib/prompts.mts",
    "references/scripts/ralph-loop/lib/setup-agent.mts",
    "references/scripts/ralph-loop/lib/worktree.mts",
    "references/scripts/ralph-loop/ralph-loop.mts",
    "templates/NON_NEGOTIABLE_RULES.md",
  ]);
});

test("harness-spec import excludes upstream git metadata", async () => {
  const gitDirs = await listGitDirectories(harnessSpecRoot);
  expect(gitDirs).toEqual([]);
});

test("harness-spec provenance metadata records upstream source", async () => {
  const metadata = await readFile(join(harnessSpecRoot, "UPSTREAM.md"), "utf8");

  expect(metadata).toContain("https://github.com/siisee11/harness.spec");
  expect(metadata).toMatch(/Resolved commit at fetch time \(\d{4}-\d{2}-\d{2}\): `[0-9a-f]{40}`/);
  expect(metadata).toContain("`SPEC.md`");
  expect(metadata).toMatch(/`SPEC\.md`: `[0-9a-f]{64}`/);
});
