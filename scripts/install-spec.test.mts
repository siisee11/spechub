import { access, chmod, mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { constants } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { expect, test } from "bun:test";

const repoRoot = process.cwd();
const installScriptPath = join(repoRoot, "scripts/install-spec.sh");

async function createArchive(specFiles: Record<string, string>): Promise<string> {
  const tempRoot = await mkdtemp(join(tmpdir(), "spechub-install-spec-"));
  const archiveSourceRoot = join(tempRoot, "spechub-main");
  const specRoot = join(archiveSourceRoot, "specs/demo-spec");

  await mkdir(specRoot, { recursive: true });

  for (const [relativePath, contents] of Object.entries(specFiles)) {
    const filePath = join(specRoot, relativePath);
    await mkdir(join(filePath, ".."), { recursive: true });
    await writeFile(filePath, contents);
  }

  const archivePath = join(tempRoot, "repo.tar.gz");
  const tar = Bun.spawn({
    cmd: ["tar", "-czf", archivePath, "-C", tempRoot, "spechub-main"],
    stdout: "pipe",
    stderr: "pipe",
  });
  const exitCode = await tar.exited;

  if (exitCode !== 0) {
    throw new Error(await new Response(tar.stderr).text());
  }

  return archivePath;
}

async function createFakeCurlBin(archivePath: string): Promise<string> {
  const binDir = await mkdtemp(join(tmpdir(), "spechub-install-bin-"));
  const curlPath = join(binDir, "curl");

  await writeFile(
    curlPath,
    `#!/usr/bin/env sh
set -eu
output_path=""
while [ "$#" -gt 0 ]; do
  case "$1" in
    -o)
      output_path="$2"
      shift 2
      ;;
    *)
      shift
      ;;
  esac
done
cp "$TEST_ARCHIVE_PATH" "$output_path"
`,
  );
  await chmod(curlPath, 0o755);

  return binDir;
}

test("install-spec copies companion files from the spec folder", async () => {
  const archivePath = await createArchive({
    "SPEC.md": "# Demo Spec\n",
    "notes.md": "extra companion file\n",
    "assets/example.txt": "nested asset\n",
  });
  const fakeCurlBin = await createFakeCurlBin(archivePath);
  const targetDir = await mkdtemp(join(tmpdir(), "spechub-install-target-"));

  const run = Bun.spawn({
    cmd: ["sh", installScriptPath, "openai/spechub", "main", "demo-spec"],
    cwd: targetDir,
    env: {
      ...process.env,
      LANG: "C",
      LC_ALL: "C",
      PATH: `${fakeCurlBin}:${process.env.PATH ?? ""}`,
      TEST_ARCHIVE_PATH: archivePath,
    },
    stdout: "pipe",
    stderr: "pipe",
  });

  const exitCode = await run.exited;
  const stdout = await new Response(run.stdout).text();
  const stderr = await new Response(run.stderr).text();

  expect({ exitCode, stderr }).toEqual({ exitCode: 0, stderr: "" });
  expect(stdout).toContain("installed demo-spec into ");
  expect(stdout.trim()).toEndWith("/specs/demo-spec");
  await access(join(targetDir, "specs/demo-spec/SPEC.md"), constants.F_OK);
  await access(join(targetDir, "specs/demo-spec/notes.md"), constants.F_OK);
  await access(join(targetDir, "specs/demo-spec/assets/example.txt"), constants.F_OK);
});

test("install-spec fails when the target spec folder lacks SPEC.md", async () => {
  const archivePath = await createArchive({
    "notes.md": "extra companion file\n",
  });
  const fakeCurlBin = await createFakeCurlBin(archivePath);
  const targetDir = await mkdtemp(join(tmpdir(), "spechub-install-target-"));

  const run = Bun.spawn({
    cmd: ["sh", installScriptPath, "openai/spechub", "main", "demo-spec"],
    cwd: targetDir,
    env: {
      ...process.env,
      LANG: "C",
      LC_ALL: "C",
      PATH: `${fakeCurlBin}:${process.env.PATH ?? ""}`,
      TEST_ARCHIVE_PATH: archivePath,
    },
    stdout: "pipe",
    stderr: "pipe",
  });

  const exitCode = await run.exited;
  const stdout = await new Response(run.stdout).text();
  const stderr = await new Response(run.stderr).text();

  expect(exitCode).toBe(1);
  expect(stdout).toBe("");
  expect(stderr).toContain("spec 'demo-spec' is missing SPEC.md");
});
