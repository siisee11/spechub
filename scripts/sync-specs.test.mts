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

test("sync-specs prefers upstream spec directory over full-repo sync for repositories ending in .spec", async () => {
  const repoRoot = await createTempRepo();
  await createSpec(repoRoot, "nested-spec", {
    metadataSource: "https://github.com/example/nested.spec",
    files: {
      "SPEC.md": "old spec\n",
      "obsolete.md": "delete me\n",
    },
  });

  const upstreamRoot = await createUpstreamRoot({
    "SPEC.md": "root spec should be ignored\n",
    "other.txt": "root file should be ignored\n",
    "spec/SPEC.md": "nested spec\n",
    "spec/notes.md": "nested notes\n",
    "spec/assets/example.txt": "nested asset\n",
  });

  const results = await syncSpecs(repoRoot, {
    slugs: ["nested-spec"],
    now: () => new Date("2026-03-11T02:03:04.000Z"),
    log: () => {},
    downloadUpstreamRepository: async () => ({
      root: upstreamRoot,
      resolvedCommit: "1111111111111111111111111111111111111111",
      cleanup: async () => {},
    }),
  });

  expect(results).toEqual([
    {
      slug: "nested-spec",
      ownerRepo: "example/nested.spec",
      ref: "main",
      mode: "spec-subdir",
    },
  ]);
  expect(await readFile(join(repoRoot, "specs/nested-spec/SPEC.md"), "utf8")).toBe("nested spec\n");
  expect(await readFile(join(repoRoot, "specs/nested-spec/notes.md"), "utf8")).toBe("nested notes\n");
  expect(await readFile(join(repoRoot, "specs/nested-spec/assets/example.txt"), "utf8")).toBe("nested asset\n");
  expect(readdir(join(repoRoot, "specs/nested-spec"))).resolves.not.toContain("obsolete.md");
  expect(readdir(join(repoRoot, "specs/nested-spec"))).resolves.not.toContain("other.txt");

  const upstreamMetadata = await readFile(join(repoRoot, "specs/nested-spec/UPSTREAM.md"), "utf8");
  expect(upstreamMetadata).toContain("# nested.spec Upstream Metadata");
  expect(upstreamMetadata).toContain("- `SPEC.md`: `https://github.com/example/nested.spec/blob/1111111111111111111111111111111111111111/spec/SPEC.md`");
  expect(upstreamMetadata).toContain("- Upstream `spec/` directory copied into the corresponding `specs/<slug>/` directory.");
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
    "spec.config.json": JSON.stringify(
      {
        schema_version: 1,
        spec: {
          key: "github:openai/symphony",
          slug: "symphony",
          title: "Symphony",
          entry: "SPEC.md",
        },
        dependencies: [],
        install: {
          include_dependencies: "transitive",
        },
      },
      null,
      2,
    ),
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
  expect(JSON.parse(await readFile(join(repoRoot, "specs/symphony/spec.config.json"), "utf8"))).toEqual({
    schema_version: 1,
    spec: {
      key: "github:openai/symphony",
      slug: "symphony",
      title: "Symphony",
      entry: "SPEC.md",
    },
    dependencies: [],
    install: {
      include_dependencies: "transitive",
    },
  });
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
  expect(upstreamMetadata).toContain("- `spec.config.json`: `https://github.com/openai/symphony/blob/abcdef1234567890abcdef1234567890abcdef12/spec.config.json`");
  expect(upstreamMetadata).toContain("- Synced files: `SPEC.md`, `LICENSE`, `NOTICE`, `spec.config.json`.");
  expect(upstreamMetadata).toContain("- `UPSTREAM.md` is repository-local provenance metadata.");
});

test("sync-specs mirrors upstream spec directory when non-.spec repositories expose spec/SPEC.md", async () => {
  const repoRoot = await createTempRepo();
  await createSpec(repoRoot, "product-spec", {
    metadataSource: "https://github.com/example/product-app",
    files: {
      "SPEC.md": "old top-level spec\n",
      "old.md": "remove me\n",
    },
  });

  const upstreamRoot = await createUpstreamRoot({
    "SPEC.md": "root-level spec should be ignored\n",
    "spec/SPEC.md": "nested upstream spec\n",
    "spec/notes.md": "nested notes\n",
    "spec/assets/diagram.txt": "diagram\n",
  });

  const results = await syncSpecs(repoRoot, {
    slugs: ["product-spec"],
    now: () => new Date("2026-03-11T09:10:11.000Z"),
    log: () => {},
    downloadUpstreamRepository: async () => ({
      root: upstreamRoot,
      resolvedCommit: "fedcba9876543210fedcba9876543210fedcba98",
      cleanup: async () => {},
    }),
  });

  expect(results).toEqual([
    {
      slug: "product-spec",
      ownerRepo: "example/product-app",
      ref: "main",
      mode: "spec-subdir",
    },
  ]);
  expect(await readFile(join(repoRoot, "specs/product-spec/SPEC.md"), "utf8")).toBe("nested upstream spec\n");
  expect(await readFile(join(repoRoot, "specs/product-spec/notes.md"), "utf8")).toBe("nested notes\n");
  expect(await readFile(join(repoRoot, "specs/product-spec/assets/diagram.txt"), "utf8")).toBe("diagram\n");
  expect(readdir(join(repoRoot, "specs/product-spec"))).resolves.not.toContain("old.md");

  const upstreamMetadata = await readFile(join(repoRoot, "specs/product-spec/UPSTREAM.md"), "utf8");
  expect(upstreamMetadata).toContain("# product-app Upstream Metadata");
  expect(upstreamMetadata).toContain("- `SPEC.md`: `https://github.com/example/product-app/blob/fedcba9876543210fedcba9876543210fedcba98/spec/SPEC.md`");
  expect(upstreamMetadata).toContain("- `notes.md`: `https://github.com/example/product-app/blob/fedcba9876543210fedcba9876543210fedcba98/spec/notes.md`");
  expect(upstreamMetadata).toContain("- Upstream `spec/` directory copied into the corresponding `specs/<slug>/` directory.");
});

test("sync-specs applies upstream .specignore patterns during full-repo sync", async () => {
  const repoRoot = await createTempRepo();
  await createSpec(repoRoot, "ignored-spec", {
    metadataSource: "https://github.com/example/ignored.spec",
    files: {
      "SPEC.md": "old spec\n",
      "notes.md": "old notes\n",
    },
  });

  const upstreamRoot = await createUpstreamRoot({
    ".specignore": ["# upstream exclusions", "notes.md", "nested/", "*.bak"].join("\n"),
    "SPEC.md": "fresh spec\n",
    "notes.md": "ignore me\n",
    "keep.md": "keep me\n",
    "nested/asset.txt": "ignore nested\n",
    "scratch.bak": "ignore glob\n",
  });

  const results = await syncSpecs(repoRoot, {
    slugs: ["ignored-spec"],
    now: () => new Date("2026-03-11T10:11:12.000Z"),
    log: () => {},
    downloadUpstreamRepository: async () => ({
      root: upstreamRoot,
      resolvedCommit: "9999999999999999999999999999999999999999",
      cleanup: async () => {},
    }),
  });

  expect(results).toEqual([
    {
      slug: "ignored-spec",
      ownerRepo: "example/ignored.spec",
      ref: "main",
      mode: "full-repo",
    },
  ]);
  expect(await readFile(join(repoRoot, "specs/ignored-spec/SPEC.md"), "utf8")).toBe("fresh spec\n");
  expect(await readFile(join(repoRoot, "specs/ignored-spec/keep.md"), "utf8")).toBe("keep me\n");
  expect(access(join(repoRoot, "specs/ignored-spec/notes.md"), constants.F_OK)).rejects.toBeDefined();
  expect(access(join(repoRoot, "specs/ignored-spec/nested/asset.txt"), constants.F_OK)).rejects.toBeDefined();
  expect(access(join(repoRoot, "specs/ignored-spec/scratch.bak"), constants.F_OK)).rejects.toBeDefined();

  const upstreamMetadata = await readFile(join(repoRoot, "specs/ignored-spec/UPSTREAM.md"), "utf8");
  expect(upstreamMetadata).toContain(
    "Imported payload mirrors upstream tracked files at the resolved commit except paths matched by upstream `.specignore`.",
  );
  expect(upstreamMetadata).toContain("- Upstream `.specignore` patterns applied: `notes.md`, `nested/`, `*.bak`.");
  expect(upstreamMetadata).toContain("- Files matched by upstream `.specignore` were intentionally not imported.");
});

test("sync-specs applies repo-root .specignore patterns during spec-subdir sync", async () => {
  const repoRoot = await createTempRepo();
  await createSpec(repoRoot, "ignored-subdir", {
    metadataSource: "https://github.com/example/ignored-subdir.spec",
    files: {
      "SPEC.md": "old spec\n",
    },
  });

  const upstreamRoot = await createUpstreamRoot({
    ".specignore": ["spec/assets/", "/spec/secret.txt"].join("\n"),
    "spec/SPEC.md": "nested spec\n",
    "spec/notes.md": "keep notes\n",
    "spec/assets/diagram.txt": "skip asset\n",
    "spec/secret.txt": "skip secret\n",
  });

  await syncSpecs(repoRoot, {
    slugs: ["ignored-subdir"],
    now: () => new Date("2026-03-11T11:12:13.000Z"),
    log: () => {},
    downloadUpstreamRepository: async () => ({
      root: upstreamRoot,
      resolvedCommit: "8888888888888888888888888888888888888888",
      cleanup: async () => {},
    }),
  });

  expect(await readFile(join(repoRoot, "specs/ignored-subdir/SPEC.md"), "utf8")).toBe("nested spec\n");
  expect(await readFile(join(repoRoot, "specs/ignored-subdir/notes.md"), "utf8")).toBe("keep notes\n");
  expect(access(join(repoRoot, "specs/ignored-subdir/assets/diagram.txt"), constants.F_OK)).rejects.toBeDefined();
  expect(access(join(repoRoot, "specs/ignored-subdir/secret.txt"), constants.F_OK)).rejects.toBeDefined();

  const upstreamMetadata = await readFile(join(repoRoot, "specs/ignored-subdir/UPSTREAM.md"), "utf8");
  expect(upstreamMetadata).toContain("- Synced files: `SPEC.md`, `notes.md`.");
  expect(upstreamMetadata).toContain("- Upstream `.specignore` patterns applied: `spec/assets/`, `/spec/secret.txt`.");
});

test("sync-specs fails when upstream .specignore excludes the required spec file", async () => {
  const repoRoot = await createTempRepo();
  await createSpec(repoRoot, "broken-spec-only", {
    metadataSource: "https://github.com/example/broken-repo",
    files: {
      "SPEC.md": "old spec\n",
    },
  });

  const upstreamRoot = await createUpstreamRoot({
    ".specignore": "SPEC.md\n",
    "SPEC.md": "fresh spec\n",
  });

  await expect(
    syncSpecs(repoRoot, {
      slugs: ["broken-spec-only"],
      log: () => {},
      downloadUpstreamRepository: async () => ({
        root: upstreamRoot,
        resolvedCommit: "7777777777777777777777777777777777777777",
        cleanup: async () => {},
      }),
    }),
  ).rejects.toThrow("required spec file is ignored by upstream .specignore: SPEC.md");
});
