import { access, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { constants } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, expect, test } from "bun:test";

import { parseCliArgs, parseGitHubRepositorySource, syncSpecs } from "./sync-specs.mts";

const tempRoots: string[] = [];

afterEach(async () => {
  while (tempRoots.length > 0) {
    const root = tempRoots.pop();
    if (root) {
      await rm(root, { recursive: true, force: true });
    }
  }
});

async function createTempRepo(): Promise<string> {
  const repoRoot = await mkdtemp(join(tmpdir(), "spechub-sync-specs-test-"));
  tempRoots.push(repoRoot);
  await mkdir(join(repoRoot, "specs"), { recursive: true });
  return repoRoot;
}

async function createSpec(
  root: string,
  slug: string,
  options: {
    metadataSource: string;
    metadataDate?: string;
    upstream?: string;
    files?: Record<string, string>;
  },
): Promise<void> {
  const specRoot = join(root, "specs", slug);
  await mkdir(specRoot, { recursive: true });
  await writeFile(
    join(specRoot, "metadata.json"),
    `${JSON.stringify(
      {
        source: options.metadataSource,
        synced_date: options.metadataDate ?? "2026-03-10T00:00:00Z",
      },
      null,
      2,
    )}\n`,
  );

  if (options.upstream) {
    await writeFile(join(specRoot, "UPSTREAM.md"), options.upstream);
  }

  for (const [relativePath, contents] of Object.entries(options.files ?? {})) {
    const targetPath = join(specRoot, relativePath);
    await mkdir(join(targetPath, ".."), { recursive: true });
    await writeFile(targetPath, contents);
  }
}

async function createUpstreamRoot(files: Record<string, string>): Promise<string> {
  const upstreamRoot = await mkdtemp(join(tmpdir(), "spechub-sync-specs-upstream-"));
  tempRoots.push(upstreamRoot);

  for (const [relativePath, contents] of Object.entries(files)) {
    const targetPath = join(upstreamRoot, relativePath);
    await mkdir(join(targetPath, ".."), { recursive: true });
    await writeFile(targetPath, contents);
  }

  return upstreamRoot;
}

test("parse helpers keep positional slugs and validate github sources", () => {
  expect(parseCliArgs(["harness-spec", "--verbose", "symphony"])).toEqual({
    slugs: ["harness-spec", "symphony"],
  });
  expect(parseGitHubRepositorySource("https://github.com/siisee11/harness.spec")).toEqual({
    ownerRepo: "siisee11/harness.spec",
    repoName: "harness.spec",
  });
  expect(() => parseGitHubRepositorySource("https://example.com/not-github")).toThrow(
    "unsupported metadata source",
  );
});

test("sync-specs replaces full vendored contents and refreshes provenance for repositories ending in .spec", async () => {
  const repoRoot = await createTempRepo();
  await createSpec(repoRoot, "harness-spec", {
    metadataSource: "https://github.com/siisee11/harness.spec",
    upstream: "Source branch/reference fetched: `release`\n",
    files: {
      "UPSTREAM.md": "Source branch/reference fetched: `release`\n",
      "SPEC.md": "old spec\n",
      "obsolete.md": "delete me\n",
    },
  });

  const upstreamRoot = await createUpstreamRoot({
    "SPEC.md": "new spec\n",
    "notes.md": "new notes\n",
    "nested/asset.txt": "nested asset\n",
  });

  const downloads: Array<{ ownerRepo: string; ref: string }> = [];
  const results = await syncSpecs(repoRoot, {
    slugs: ["harness-spec"],
    now: () => new Date("2026-03-11T01:02:03.000Z"),
    log: () => {},
    downloadUpstreamRepository: async (options) => {
      downloads.push(options);
      return {
        root: upstreamRoot,
        resolvedCommit: "1234567890abcdef1234567890abcdef12345678",
        cleanup: async () => {},
      };
    },
  });

  expect(results).toEqual([
    {
      slug: "harness-spec",
      ownerRepo: "siisee11/harness.spec",
      ref: "release",
      mode: "full-repo",
    },
  ]);
  expect(downloads).toEqual([{ ownerRepo: "siisee11/harness.spec", ref: "release" }]);
  expect(await readFile(join(repoRoot, "specs/harness-spec/SPEC.md"), "utf8")).toBe("new spec\n");
  expect(await readFile(join(repoRoot, "specs/harness-spec/notes.md"), "utf8")).toBe("new notes\n");
  expect(await readFile(join(repoRoot, "specs/harness-spec/nested/asset.txt"), "utf8")).toBe("nested asset\n");
  await access(join(repoRoot, "specs/harness-spec/metadata.json"), constants.F_OK);
  expect(readdir(join(repoRoot, "specs/harness-spec"))).resolves.not.toContain("obsolete.md");
  expect(JSON.parse(await readFile(join(repoRoot, "specs/harness-spec/metadata.json"), "utf8"))).toEqual({
    source: "https://github.com/siisee11/harness.spec",
    synced_date: "2026-03-11T01:02:03.000Z",
  });

  const upstreamMetadata = await readFile(join(repoRoot, "specs/harness-spec/UPSTREAM.md"), "utf8");
  expect(upstreamMetadata).toContain("# harness.spec Upstream Metadata");
  expect(upstreamMetadata).toContain("Source branch/reference fetched: `release`");
  expect(upstreamMetadata).toContain(
    "Resolved commit at fetch time (2026-03-11): `1234567890abcdef1234567890abcdef12345678`",
  );
  expect(upstreamMetadata).toContain(
    "- Repository root: `https://github.com/siisee11/harness.spec/tree/1234567890abcdef1234567890abcdef12345678`",
  );
  expect(upstreamMetadata).toContain("- `SPEC.md`: `");
  expect(upstreamMetadata).toContain("- `nested/asset.txt`: `");
  expect(upstreamMetadata).toContain("- `metadata.json` is repository-local discovery metadata.");
});

test("sync-specs refreshes selected upstream-managed files for non-.spec repositories and defaults ref to main", async () => {
  const repoRoot = await createTempRepo();
  await createSpec(repoRoot, "symphony", {
    metadataSource: "https://github.com/openai/symphony",
    files: {
      "SPEC.md": "old spec\n",
      "LICENSE": "keep current license\n",
      "NOTICE": "keep current notice\n",
    },
  });

  const upstreamRoot = await createUpstreamRoot({
    "SPEC.md": "fresh upstream spec\n",
    "LICENSE": "fresh upstream license\n",
    "NOTICE": "fresh upstream notice\n",
  });

  const downloads: Array<{ ownerRepo: string; ref: string }> = [];
  const results = await syncSpecs(repoRoot, {
    now: () => new Date("2026-03-11T05:06:07.000Z"),
    log: () => {},
    downloadUpstreamRepository: async (options) => {
      downloads.push(options);
      return {
        root: upstreamRoot,
        resolvedCommit: "abcdef1234567890abcdef1234567890abcdef12",
        cleanup: async () => {},
      };
    },
  });

  expect(results).toEqual([
    {
      slug: "symphony",
      ownerRepo: "openai/symphony",
      ref: "main",
      mode: "spec-only",
    },
  ]);
  expect(downloads).toEqual([{ ownerRepo: "openai/symphony", ref: "main" }]);
  expect(await readFile(join(repoRoot, "specs/symphony/SPEC.md"), "utf8")).toBe("fresh upstream spec\n");
  expect(await readFile(join(repoRoot, "specs/symphony/LICENSE"), "utf8")).toBe("fresh upstream license\n");
  expect(await readFile(join(repoRoot, "specs/symphony/NOTICE"), "utf8")).toBe("fresh upstream notice\n");
  expect(JSON.parse(await readFile(join(repoRoot, "specs/symphony/metadata.json"), "utf8"))).toEqual({
    source: "https://github.com/openai/symphony",
    synced_date: "2026-03-11T05:06:07.000Z",
  });

  const upstreamMetadata = await readFile(join(repoRoot, "specs/symphony/UPSTREAM.md"), "utf8");
  expect(upstreamMetadata).toContain("# symphony Upstream Metadata");
  expect(upstreamMetadata).toContain("Source branch/reference fetched: `main`");
  expect(upstreamMetadata).toContain(
    "Resolved commit at fetch time (2026-03-11): `abcdef1234567890abcdef1234567890abcdef12`",
  );
  expect(upstreamMetadata).toContain("- `SPEC.md`: `https://github.com/openai/symphony/blob/abcdef1234567890abcdef1234567890abcdef12/SPEC.md`");
  expect(upstreamMetadata).toContain("- `LICENSE`: `https://github.com/openai/symphony/blob/abcdef1234567890abcdef1234567890abcdef12/LICENSE`");
  expect(upstreamMetadata).toContain("- `NOTICE`: `https://github.com/openai/symphony/blob/abcdef1234567890abcdef1234567890abcdef12/NOTICE`");
  expect(upstreamMetadata).toContain("- Synced files: `SPEC.md`, `LICENSE`, `NOTICE`.");
  expect(upstreamMetadata).toContain("- `UPSTREAM.md` is repository-local provenance metadata.");
});
