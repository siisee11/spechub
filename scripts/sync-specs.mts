import { createHash } from "node:crypto";
import { access, cp, mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const REPO_LOCAL_FILES = new Set(["metadata.json", "UPSTREAM.md"]);
const SPEC_ONLY_FILES = ["SPEC.md", "LICENSE", "NOTICE"] as const;
const GIT_METADATA_DIRECTORY = ".git";

export type SyncResult = {
  slug: string;
  ownerRepo: string;
  ref: string;
  mode: "full-repo" | "spec-subdir" | "spec-only";
};

type Metadata = {
  source: string;
  synced_date?: string;
  [key: string]: unknown;
};

type DownloadedRepo = {
  root: string;
  resolvedCommit: string;
  cleanup: () => Promise<void>;
};

type SyncMode = "full-repo" | "spec-subdir" | "spec-only";

type SyncDependencies = {
  downloadUpstreamRepository?: (options: { ownerRepo: string; ref: string }) => Promise<DownloadedRepo>;
  now?: () => Date;
  log?: (line: string) => void;
};

export function parseCliArgs(argv: string[]): { slugs: string[] } {
  return {
    slugs: argv.filter((value) => !value.startsWith("--")),
  };
}

export function parseGitHubRepositorySource(source: string): { ownerRepo: string; repoName: string } {
  const match = source.trim().match(/^https:\/\/github\.com\/([^/\s]+)\/([^/\s]+?)(?:\.git)?\/?$/);
  if (!match) {
    throw new Error(`unsupported metadata source: ${source}`);
  }

  const ownerRepo = `${match[1]}/${match[2]}`;
  return {
    ownerRepo,
    repoName: match[2],
  };
}

export async function syncSpecs(
  repoRoot: string,
  options: { slugs?: string[] } & SyncDependencies = {},
): Promise<SyncResult[]> {
  const specsRoot = join(repoRoot, "specs");
  const requestedSlugs = options.slugs ?? [];
  const slugs = requestedSlugs.length > 0 ? requestedSlugs : await listSpecSlugs(specsRoot);
  const results: SyncResult[] = [];

  for (const slug of slugs) {
    results.push(await syncSingleSpec(specsRoot, slug, options));
  }

  return results;
}

export async function syncSingleSpec(
  specsRoot: string,
  slug: string,
  options: SyncDependencies = {},
): Promise<SyncResult> {
  const specDir = join(specsRoot, slug);
  const metadataPath = join(specDir, "metadata.json");
  const metadata = await readMetadata(metadataPath);
  const { ownerRepo, repoName } = parseGitHubRepositorySource(metadata.source);
  const ref = await readRecordedRef(specDir);
  const downloader = options.downloadUpstreamRepository ?? downloadUpstreamRepository;
  const syncTime = (options.now ?? (() => new Date()))();
  const log = options.log ?? console.log;
  const downloaded = await downloader({ ownerRepo, ref });

  try {
    const upstreamSpecDir = join(downloaded.root, "spec");
    const hasUpstreamSpecDir = await pathExists(upstreamSpecDir);
    let mode: SyncMode;
    let syncedFiles: string[];
    let upstreamCopyRoot: string;
    let upstreamPathPrefix = "";

    if (hasUpstreamSpecDir) {
      const nestedSpecPath = join(upstreamSpecDir, "SPEC.md");
      if (!(await pathExists(nestedSpecPath))) {
        throw new Error(`missing spec/SPEC.md in upstream repository at ${downloaded.root}`);
      }
      mode = "spec-subdir";
      upstreamCopyRoot = upstreamSpecDir;
      upstreamPathPrefix = "spec/";
      syncedFiles = await replaceSpecDirectoryFromRepository(upstreamSpecDir, specDir);
    } else if (repoName.endsWith(".spec")) {
      mode = "full-repo";
      upstreamCopyRoot = downloaded.root;
      syncedFiles = await replaceSpecDirectoryFromRepository(downloaded.root, specDir);
    } else {
      mode = "spec-only";
      upstreamCopyRoot = downloaded.root;
      syncedFiles = await replaceSpecFilesFromRepository(downloaded.root, specDir);
    }

    await writeFile(
      join(specDir, "UPSTREAM.md"),
      await renderUpstreamMetadata({
        ownerRepo,
        repoName,
        ref,
        resolvedCommit: downloaded.resolvedCommit,
        mode,
        specDir,
        upstreamCopyRoot,
        upstreamRepoRoot: downloaded.root,
        upstreamPathPrefix,
        syncedFiles,
        syncedAt: syncTime,
      }),
    );

    await writeMetadata(metadataPath, {
      ...metadata,
      synced_date: syncTime.toISOString(),
    });

    log(`synced ${slug} from ${ownerRepo}@${ref} (${mode})`);

    return {
      slug,
      ownerRepo,
      ref,
      mode,
    };
  } finally {
    await downloaded.cleanup();
  }
}

async function listSpecSlugs(specsRoot: string): Promise<string[]> {
  const entries = await readdir(specsRoot, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
}

async function readMetadata(metadataPath: string): Promise<Metadata> {
  const raw = await readFile(metadataPath, "utf8");
  const parsed = JSON.parse(raw) as Metadata;
  if (typeof parsed.source !== "string" || parsed.source.trim() === "") {
    throw new Error(`invalid metadata source in ${metadataPath}`);
  }
  return parsed;
}

async function writeMetadata(metadataPath: string, metadata: Metadata): Promise<void> {
  await writeFile(metadataPath, `${JSON.stringify(metadata, null, 2)}\n`);
}

async function readRecordedRef(specDir: string): Promise<string> {
  try {
    const upstream = await readFile(join(specDir, "UPSTREAM.md"), "utf8");
    const match = upstream.match(/Source branch\/reference fetched: `([^`]+)`/);
    if (match?.[1]) {
      return match[1];
    }
  } catch (error) {
    if (!(error instanceof Error) || !("code" in error) || error.code !== "ENOENT") {
      throw error;
    }
  }

  return "main";
}

async function replaceSpecDirectoryFromRepository(sourceRoot: string, targetRoot: string): Promise<string[]> {
  await clearDirectoryExcept(targetRoot, REPO_LOCAL_FILES);
  const entries = await readdir(sourceRoot, { withFileTypes: true });
  const syncedFiles: string[] = [];

  for (const entry of entries) {
    if (entry.name === GIT_METADATA_DIRECTORY) {
      continue;
    }

    const sourcePath = join(sourceRoot, entry.name);
    const targetPath = join(targetRoot, entry.name);
    await cp(sourcePath, targetPath, { recursive: true, force: true });
    if (entry.isDirectory()) {
      syncedFiles.push(...(await listRelativeFiles(targetRoot, entry.name)));
    } else {
      syncedFiles.push(entry.name);
    }
  }

  return syncedFiles.sort();
}

async function clearDirectoryExcept(targetRoot: string, preservedNames: Set<string>): Promise<void> {
  const entries = await readdir(targetRoot, { withFileTypes: true });

  for (const entry of entries) {
    if (preservedNames.has(entry.name)) {
      continue;
    }
    await rm(join(targetRoot, entry.name), { recursive: true, force: true });
  }
}

async function replaceSpecFilesFromRepository(sourceRoot: string, targetRoot: string): Promise<string[]> {
  const syncedFiles: string[] = [];

  for (const filename of SPEC_ONLY_FILES) {
    const sourcePath = join(sourceRoot, filename);
    if (!(await pathExists(sourcePath))) {
      if (filename === "SPEC.md") {
        throw new Error(`missing SPEC.md in upstream repository at ${sourceRoot}`);
      }
      continue;
    }

    await cp(sourcePath, join(targetRoot, filename), { force: true });
    syncedFiles.push(filename);
  }

  return syncedFiles;
}

async function downloadUpstreamRepository(options: { ownerRepo: string; ref: string }): Promise<DownloadedRepo> {
  const tempRoot = await mkdtemp(join(tmpdir(), "spechub-sync-specs-"));
  const archivePath = join(tempRoot, "repo.tar.gz");
  const resolvedCommit = await resolveGitHubCommit(options);
  const response = await fetch(`https://codeload.github.com/${options.ownerRepo}/tar.gz/${options.ref}`);

  if (!response.ok) {
    await rm(tempRoot, { recursive: true, force: true });
    throw new Error(`failed to download ${options.ownerRepo}@${options.ref}: ${response.status}`);
  }

  await Bun.write(archivePath, await response.bytes());
  const extract = Bun.spawn({
    cmd: ["tar", "-xzf", archivePath, "-C", tempRoot],
    stdout: "pipe",
    stderr: "pipe",
  });
  const exitCode = await extract.exited;

  if (exitCode !== 0) {
    const stderr = await new Response(extract.stderr).text();
    await rm(tempRoot, { recursive: true, force: true });
    throw new Error(`failed to extract ${options.ownerRepo}@${options.ref}: ${stderr.trim()}`);
  }

  const entries = await readdir(tempRoot, { withFileTypes: true });
  const repoDirectory = entries.find((entry) => entry.isDirectory());

  if (!repoDirectory) {
    await rm(tempRoot, { recursive: true, force: true });
    throw new Error(`downloaded archive for ${options.ownerRepo}@${options.ref} had no repository directory`);
  }

  return {
    root: join(tempRoot, repoDirectory.name),
    resolvedCommit,
    cleanup: async () => {
      await rm(tempRoot, { recursive: true, force: true });
    },
  };
}

async function resolveGitHubCommit(options: { ownerRepo: string; ref: string }): Promise<string> {
  const response = await fetch(`https://api.github.com/repos/${options.ownerRepo}/commits/${options.ref}`, {
    headers: {
      Accept: "application/vnd.github+json",
      "User-Agent": "spechub-sync-specs",
    },
  });

  if (!response.ok) {
    throw new Error(`failed to resolve commit for ${options.ownerRepo}@${options.ref}: ${response.status}`);
  }

  const payload = (await response.json()) as { sha?: unknown };
  if (typeof payload.sha !== "string" || payload.sha.length !== 40) {
    throw new Error(`invalid commit payload for ${options.ownerRepo}@${options.ref}`);
  }

  return payload.sha;
}

async function renderUpstreamMetadata(options: {
  ownerRepo: string;
  repoName: string;
  ref: string;
  resolvedCommit: string;
  mode: SyncMode;
  specDir: string;
  upstreamCopyRoot: string;
  upstreamRepoRoot: string;
  upstreamPathPrefix: string;
  syncedFiles: string[];
  syncedAt: Date;
}): Promise<string> {
  const hashes = await Promise.all(
    options.syncedFiles.map(async (relativePath) => ({
      relativePath,
      sha256: createHash("sha256").update(await readFile(join(options.specDir, relativePath))).digest("hex"),
    })),
  );
  const licenseLine = (await pathExists(join(options.upstreamRepoRoot, "LICENSE")))
    ? "top-level `LICENSE` file present at fetched commit."
    : "no top-level `LICENSE` file present at fetched commit.";
  const canonicalUrls =
    options.mode === "full-repo"
      ? [
          `- Repository root: \`https://github.com/${options.ownerRepo}/tree/${options.resolvedCommit}\``,
          `- Main spec: \`https://github.com/${options.ownerRepo}/blob/${options.resolvedCommit}/SPEC.md\``,
        ]
      : options.syncedFiles.map((relativePath) => {
          const upstreamRelativePath = `${options.upstreamPathPrefix}${relativePath}`.replaceAll("//", "/");
          return `- \`${relativePath}\`: \`https://github.com/${options.ownerRepo}/blob/${options.resolvedCommit}/${upstreamRelativePath}\``;
        });
  const importMethodLines =
    options.mode === "full-repo"
      ? [
          "- Vendored snapshot copy under the corresponding `specs/<slug>/` directory.",
          "- Upstream git metadata (`.git/`) excluded.",
          "- Imported payload mirrors upstream tracked files at the resolved commit.",
        ]
      : options.mode === "spec-subdir"
        ? [
            "- Upstream `spec/` directory copied into the corresponding `specs/<slug>/` directory.",
            `- Synced files: ${options.syncedFiles.map((relativePath) => `\`${relativePath}\``).join(", ")}.`,
            "- Repository-local metadata files are preserved.",
          ]
      : [
          "- Selected upstream files copied into the corresponding `specs/<slug>/` directory.",
          `- Synced files: ${options.syncedFiles.map((relativePath) => `\`${relativePath}\``).join(", ")}.`,
          "- Repository-local metadata files are preserved.",
        ];
  const modificationStatusLines =
    options.mode === "full-repo"
      ? [
          `- All files except \`metadata.json\` and \`UPSTREAM.md\` are unmodified copies of upstream tracked files at commit \`${options.resolvedCommit}\`.`,
          "- `metadata.json` is repository-local discovery metadata.",
          "- `UPSTREAM.md` is repository-local provenance metadata.",
        ]
      : [
          ...options.syncedFiles.map(
            (relativePath) =>
              `- \`${relativePath}\`: unmodified copy of the upstream file at commit \`${options.resolvedCommit}\`.`,
          ),
          "- `metadata.json` is repository-local discovery metadata.",
          "- `UPSTREAM.md` is repository-local provenance metadata.",
        ];

  return [
    `# ${options.repoName} Upstream Metadata`,
    "",
    `This directory vendors third-party specification content from \`${options.ownerRepo}\`.`,
    "",
    "## Upstream repository",
    "",
    `- Repository: \`https://github.com/${options.ownerRepo}\``,
    `- Source branch/reference fetched: \`${options.ref}\``,
    `- Resolved commit at fetch time (${options.syncedAt.toISOString().slice(0, 10)}): \`${options.resolvedCommit}\``,
    `- License in upstream repo: ${licenseLine}`,
    "",
    "## Canonical source URLs",
    "",
    ...canonicalUrls,
    "",
    "## Import method",
    "",
    ...importMethodLines,
    "",
    "## Integrity hashes from imported files",
    "",
    ...hashes.map(({ relativePath, sha256 }) => `- \`${relativePath}\`: \`${sha256}\``),
    "",
    "## Modification status",
    "",
    ...modificationStatusLines,
    "",
  ].join("\n");
}

async function listRelativeFiles(root: string, relative = ""): Promise<string[]> {
  const current = join(root, relative);
  const entries = await readdir(current, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    if (entry.name === GIT_METADATA_DIRECTORY) {
      continue;
    }

    const nextRelative = relative === "" ? entry.name : join(relative, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await listRelativeFiles(root, nextRelative)));
      continue;
    }
    files.push(nextRelative.replaceAll("\\", "/"));
  }

  return files.sort();
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      return false;
    }
    throw error;
  }
}

async function main(): Promise<void> {
  const options = parseCliArgs(Bun.argv.slice(2));
  await syncSpecs(process.cwd(), options);
}

if (import.meta.main) {
  await main();
}
