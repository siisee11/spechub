import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";

import { expect, test } from "bun:test";

const repoRoot = process.cwd();
const specRoot = join(repoRoot, "specs", "ralph-loop");

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

test("ralph-loop import contains the expected vendored file set", async () => {
  expect(await listFiles(specRoot)).toEqual([
    "SPEC.md",
    "UPSTREAM.md",
    "metadata.json",
    "references/ralph-loop",
  ]);
});

test("ralph-loop provenance metadata records upstream source", async () => {
  const metadata = await readFile(join(specRoot, "UPSTREAM.md"), "utf8");

  expect(metadata).toContain("https://github.com/siisee11/ralph-loop.spec");
  expect(metadata).toMatch(/Resolved commit at fetch time \(\d{4}-\d{2}-\d{2}\): `[0-9a-f]{40}`/);
  expect(metadata).toContain("Main spec");
  expect(metadata).toContain("`references/ralph-loop`");
  expect(metadata).toMatch(/`SPEC\.md`: `[0-9a-f]{64}`/);
});
