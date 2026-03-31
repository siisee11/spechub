import { access, chmod, mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import { constants } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { expect, test } from "bun:test";

const repoRoot = process.cwd();
const installScriptPath = join(repoRoot, "scripts/install-spec.sh");

async function createArchiveForSpecs(specs: Record<string, Record<string, string>>): Promise<string> {
  const tempRoot = await mkdtemp(join(tmpdir(), "spechub-install-spec-"));
  const archiveSourceRoot = join(tempRoot, "spechub-main");

  for (const [slug, specFiles] of Object.entries(specs)) {
    const specRoot = join(archiveSourceRoot, "specs", slug);
    await mkdir(specRoot, { recursive: true });

    for (const [relativePath, contents] of Object.entries(specFiles)) {
      const filePath = join(specRoot, relativePath);
      await mkdir(join(filePath, ".."), { recursive: true });
      await writeFile(filePath, contents);
    }
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

async function createArchive(specFiles: Record<string, string>): Promise<string> {
  return createArchiveForSpecs({
    "demo-spec": specFiles,
  });
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

function buildSpecConfig(options: {
  key: string;
  slug: string;
  title: string;
  dependencies?: Array<{ key: string; type: "requires"; reason: string }>;
}): string {
  return JSON.stringify(
    {
      schema_version: 1,
      spec: {
        key: options.key,
        slug: options.slug,
        title: options.title,
        entry: "SPEC.md",
      },
      dependencies: options.dependencies ?? [],
      install: {
        include_dependencies: "transitive",
      },
    },
    null,
    2,
  );
}

async function runInstall(targetDir: string, archivePath: string, options?: { slug?: string; input?: string }) {
  const fakeCurlBin = await createFakeCurlBin(archivePath);
  const slug = options?.slug ?? "demo-spec";
  const input = options?.input;
  const run = Bun.spawn({
    cmd: ["sh", installScriptPath, "openai/spechub", "main", slug],
    cwd: targetDir,
    stdin: input === undefined ? "ignore" : "pipe",
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

  if (input !== undefined) {
    run.stdin.write(input);
    run.stdin.end();
  }

  return {
    exitCode: await run.exited,
    stdout: await new Response(run.stdout).text(),
    stderr: await new Response(run.stderr).text(),
  };
}

async function runInstallFromScriptWithTty(
  targetDir: string,
  archivePath: string,
  options?: { slug?: string; input?: string },
) {
  const fakeCurlBin = await createFakeCurlBin(archivePath);
  const slug = options?.slug ?? "demo-spec";
  const input = options?.input ?? "";
  const ptyRunner = String.raw`
import os
import pty
import select
import sys

pid, master = pty.fork()
if pid == 0:
    os.chdir(os.environ["TEST_CWD"])
    os.execvpe(
        "sh",
        ["sh", "-c", 'sh -s -- "$TEST_REPO" "$TEST_REF" "$TEST_SLUG" < "$INSTALL_SCRIPT_PATH"'],
        os.environ.copy(),
    )

prompt = b"Overwrite? [y/N]"
reply = os.environ.get("TEST_TTY_INPUT", "").encode()
sent = False
chunks = []

while True:
    ready, _, _ = select.select([master], [], [], 0.1)
    if master in ready:
        try:
            data = os.read(master, 4096)
        except OSError:
            data = b""
        if data:
            chunks.append(data)
            if (not sent) and prompt in b"".join(chunks):
                if reply:
                    os.write(master, reply)
                sent = True

    try:
        finished_pid, status = os.waitpid(pid, os.WNOHANG)
    except ChildProcessError:
        finished_pid, status = pid, 0

    if finished_pid == pid:
        while True:
            try:
                data = os.read(master, 4096)
            except OSError:
                break
            if not data:
                break
            chunks.append(data)
        break

os.close(master)
sys.stdout.buffer.write(b"".join(chunks))
if os.WIFEXITED(status):
    sys.exit(os.WEXITSTATUS(status))
if os.WIFSIGNALED(status):
    sys.exit(128 + os.WTERMSIG(status))
sys.exit(1)
`;
  const run = Bun.spawn({
    cmd: ["python3", "-c", ptyRunner],
    stdin: "ignore",
    env: {
      ...process.env,
      LANG: "C",
      LC_ALL: "C",
      PATH: `${fakeCurlBin}:${process.env.PATH ?? ""}`,
      TEST_ARCHIVE_PATH: archivePath,
      INSTALL_SCRIPT_PATH: installScriptPath,
      TEST_CWD: targetDir,
      TEST_TTY_INPUT: input,
      TEST_REPO: "openai/spechub",
      TEST_REF: "main",
      TEST_SLUG: slug,
    },
    stdout: "pipe",
    stderr: "pipe",
  });

  return {
    exitCode: await run.exited,
    stdout: await new Response(run.stdout).text(),
    stderr: await new Response(run.stderr).text(),
  };
}

test("install-spec copies companion files from the spec folder", async () => {
  const archivePath = await createArchive({
    "SPEC.md": "# Demo Spec\n",
    "notes.md": "extra companion file\n",
    "assets/example.txt": "nested asset\n",
  });
  const targetDir = await mkdtemp(join(tmpdir(), "spechub-install-target-"));
  const { exitCode, stdout, stderr } = await runInstall(targetDir, archivePath);

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
  const targetDir = await mkdtemp(join(tmpdir(), "spechub-install-target-"));
  const { exitCode, stdout, stderr } = await runInstall(targetDir, archivePath);

  expect(exitCode).toBe(1);
  expect(stdout).toBe("");
  expect(stderr).toContain("spec 'demo-spec' is missing SPEC.md");
});

test("install-spec prompts before overwriting an existing spec folder and replaces it on yes", async () => {
  const archivePath = await createArchive({
    "SPEC.md": "# Fresh Demo Spec\n",
    "notes.md": "fresh companion file\n",
  });
  const targetDir = await mkdtemp(join(tmpdir(), "spechub-install-target-"));
  const existingSpecRoot = join(targetDir, "specs/demo-spec");

  await mkdir(existingSpecRoot, { recursive: true });
  await writeFile(join(existingSpecRoot, "SPEC.md"), "# Old Demo Spec\n");
  await writeFile(join(existingSpecRoot, "notes.md"), "stale companion file\n");

  const { exitCode, stdout, stderr } = await runInstall(targetDir, archivePath, { input: "yes\n" });

  expect(exitCode).toBe(0);
  expect(stdout).toContain("installed demo-spec into ");
  expect(stdout.trim()).toEndWith("/specs/demo-spec");
  expect(stderr).toContain("destination './specs/demo-spec' already exists. Overwrite? [y/N]");
  expect(await readFile(join(existingSpecRoot, "SPEC.md"), "utf8")).toBe("# Fresh Demo Spec\n");
  expect(await readFile(join(existingSpecRoot, "notes.md"), "utf8")).toBe("fresh companion file\n");
});

test("install-spec leaves an existing spec folder unchanged when overwrite is declined", async () => {
  const archivePath = await createArchive({
    "SPEC.md": "# Fresh Demo Spec\n",
  });
  const targetDir = await mkdtemp(join(tmpdir(), "spechub-install-target-"));
  const existingSpecRoot = join(targetDir, "specs/demo-spec");

  await mkdir(existingSpecRoot, { recursive: true });
  await writeFile(join(existingSpecRoot, "SPEC.md"), "# Old Demo Spec\n");

  const { exitCode, stdout, stderr } = await runInstall(targetDir, archivePath, { input: "no\n" });

  expect(exitCode).toBe(1);
  expect(stdout).toBe("");
  expect(stderr).toContain("destination './specs/demo-spec' already exists. Overwrite? [y/N]");
  expect(stderr).toContain("skipped overwriting existing destination './specs/demo-spec'");
  expect(await readFile(join(existingSpecRoot, "SPEC.md"), "utf8")).toBe("# Old Demo Spec\n");
});

test("install-spec reads overwrite confirmation from /dev/tty when the script is piped into sh", async () => {
  const archivePath = await createArchive({
    "SPEC.md": "# Fresh Demo Spec\n",
    "notes.md": "fresh companion file\n",
  });
  const targetDir = await mkdtemp(join(tmpdir(), "spechub-install-target-"));
  const existingSpecRoot = join(targetDir, "specs/demo-spec");

  await mkdir(existingSpecRoot, { recursive: true });
  await writeFile(join(existingSpecRoot, "SPEC.md"), "# Old Demo Spec\n");
  await writeFile(join(existingSpecRoot, "notes.md"), "stale companion file\n");

  const { exitCode, stdout, stderr } = await runInstallFromScriptWithTty(targetDir, archivePath, { input: "yes\n" });
  const combinedOutput = `${stdout}\n${stderr}`;

  expect(exitCode).toBe(0);
  expect(combinedOutput).toContain("destination './specs/demo-spec' already exists. Overwrite? [y/N]");
  expect(combinedOutput).toContain("installed demo-spec into ");
  expect(await readFile(join(existingSpecRoot, "SPEC.md"), "utf8")).toBe("# Fresh Demo Spec\n");
  expect(await readFile(join(existingSpecRoot, "notes.md"), "utf8")).toBe("fresh companion file\n");
});

test("install-spec installs transitive dependencies declared in spec.config.json", async () => {
  const archivePath = await createArchiveForSpecs({
    "loop-state-machine": {
      "SPEC.md": "# Loop State Machine\n",
      "spec.config.json": buildSpecConfig({
        key: "github:siisee11/loop-state-machine.spec",
        slug: "loop-state-machine",
        title: "Loop State Machine",
      }),
    },
    "ralph-loop": {
      "SPEC.md": "# Ralph Loop\n",
      "spec.config.json": buildSpecConfig({
        key: "github:siisee11/ralph-loop.spec#spec",
        slug: "ralph-loop",
        title: "Ralph Loop",
        dependencies: [
          {
            key: "github:siisee11/loop-state-machine.spec",
            type: "requires",
            reason: "LSM provides the host loop contract.",
          },
        ],
      }),
    },
    "harness-spec": {
      "SPEC.md": "# Harness\n",
      "spec.config.json": buildSpecConfig({
        key: "github:siisee11/harness.spec",
        slug: "harness-spec",
        title: "Harness",
        dependencies: [
          {
            key: "github:siisee11/ralph-loop.spec#spec",
            type: "requires",
            reason: "Harness depends on Ralph Loop.",
          },
        ],
      }),
    },
  });
  const targetDir = await mkdtemp(join(tmpdir(), "spechub-install-target-"));
  const { exitCode, stdout, stderr } = await runInstall(targetDir, archivePath, { slug: "harness-spec" });

  expect(exitCode).toBe(0);
  expect(stdout).toContain("installed harness-spec into ");
  expect(stderr).toContain("installed dependency loop-state-machine into ");
  expect(stderr).toContain("installed dependency ralph-loop into ");
  await access(join(targetDir, "specs/loop-state-machine/SPEC.md"), constants.F_OK);
  await access(join(targetDir, "specs/ralph-loop/SPEC.md"), constants.F_OK);
  await access(join(targetDir, "specs/harness-spec/SPEC.md"), constants.F_OK);
});
