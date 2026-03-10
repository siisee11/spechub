import { mkdir, rm, stat } from "node:fs/promises";
import { dirname, resolve } from "node:path";

export type WorkspaceHooks = {
  afterCreate?: string;
  beforeRun?: string;
  afterRun?: string;
  beforeRemove?: string;
  timeoutMs: number;
};

export type WorkspaceInfo = {
  path: string;
  workspaceKey: string;
  createdNow: boolean;
};

export type CommandResult = {
  code: number;
  stdout: string;
  stderr: string;
  timedOut: boolean;
};

export type CommandRunner = (options: {
  cmd: string[];
  cwd: string;
  timeoutMs: number;
}) => Promise<CommandResult>;

export function sanitizeWorkspaceKey(identifier: string): string {
  return identifier.replace(/[^A-Za-z0-9._-]/g, "_");
}

export function resolveWorkspacePath(workspaceRoot: string, issueIdentifier: string): string {
  return resolve(workspaceRoot, sanitizeWorkspaceKey(issueIdentifier));
}

export function assertWorkspaceWithinRoot(workspaceRoot: string, workspacePath: string): void {
  const normalizedRoot = resolve(workspaceRoot);
  const normalizedPath = resolve(workspacePath);
  if (
    normalizedPath !== normalizedRoot &&
    !normalizedPath.startsWith(`${normalizedRoot}/`)
  ) {
    throw new Error("workspace path escapes configured workspace root");
  }
}

export class WorkspaceManager {
  #repoRoot: string;
  #workspaceRoot: string;
  #hooks: WorkspaceHooks;
  #runCommand: CommandRunner;

  constructor(options: {
    repoRoot: string;
    workspaceRoot: string;
    hooks: WorkspaceHooks;
    runCommand?: CommandRunner;
  }) {
    this.#repoRoot = options.repoRoot;
    this.#workspaceRoot = resolve(options.workspaceRoot);
    this.#hooks = options.hooks;
    this.#runCommand = options.runCommand ?? defaultRunCommand;
  }

  async ensureWorkspace(issueIdentifier: string): Promise<WorkspaceInfo> {
    await mkdir(this.#workspaceRoot, { recursive: true });
    const workspacePath = resolveWorkspacePath(this.#workspaceRoot, issueIdentifier);
    assertWorkspaceWithinRoot(this.#workspaceRoot, workspacePath);

    const existing = await safeStat(workspacePath);
    if (existing && !existing.isDirectory()) {
      throw new Error(`workspace path is not a directory: ${workspacePath}`);
    }

    const createdNow = !existing;
    if (createdNow) {
      await this.#populateWorkspace(workspacePath, issueIdentifier);
      await this.runHook("after_create", workspacePath, true);
    }

    return {
      path: workspacePath,
      workspaceKey: sanitizeWorkspaceKey(issueIdentifier),
      createdNow,
    };
  }

  async removeWorkspace(issueIdentifier: string): Promise<void> {
    const workspacePath = resolveWorkspacePath(this.#workspaceRoot, issueIdentifier);
    const existing = await safeStat(workspacePath);
    if (!existing?.isDirectory()) {
      return;
    }

    await this.runHook("before_remove", workspacePath, false);
    const result = await this.#runCommand({
      cmd: ["git", "-C", this.#repoRoot, "worktree", "remove", "--force", workspacePath],
      cwd: this.#repoRoot,
      timeoutMs: this.#hooks.timeoutMs,
    });

    if (result.code !== 0) {
      await rm(workspacePath, { recursive: true, force: true });
    }
  }

  async runHook(
    name: "after_create" | "before_run" | "after_run" | "before_remove",
    cwd: string,
    fatal: boolean,
  ): Promise<void> {
    const script = selectHook(this.#hooks, name);
    if (!script) {
      return;
    }
    const result = await this.#runCommand({
      cmd: ["bash", "-lc", script],
      cwd,
      timeoutMs: this.#hooks.timeoutMs,
    });
    if (!fatal || (result.code === 0 && !result.timedOut)) {
      return;
    }
    throw new Error(`${name} hook failed`);
  }

  async #populateWorkspace(workspacePath: string, issueIdentifier: string): Promise<void> {
    await mkdir(dirname(workspacePath), { recursive: true });
    const branch = `symphony/${sanitizeWorkspaceKey(issueIdentifier).toLowerCase()}`;
    const branchExists = await this.#runCommand({
      cmd: ["git", "-C", this.#repoRoot, "show-ref", "--verify", "--quiet", `refs/heads/${branch}`],
      cwd: this.#repoRoot,
      timeoutMs: this.#hooks.timeoutMs,
    });
    const createCmd =
      branchExists.code === 0
        ? ["git", "-C", this.#repoRoot, "worktree", "add", workspacePath, branch]
        : ["git", "-C", this.#repoRoot, "worktree", "add", "-b", branch, workspacePath, "HEAD"];
    const result = await this.#runCommand({
      cmd: createCmd,
      cwd: this.#repoRoot,
      timeoutMs: this.#hooks.timeoutMs,
    });
    if (result.code !== 0 || result.timedOut) {
      throw new Error(`failed to create workspace for ${issueIdentifier}`);
    }
  }
}

async function safeStat(targetPath: string) {
  try {
    return await stat(targetPath);
  } catch {
    return null;
  }
}

async function defaultRunCommand(options: {
  cmd: string[];
  cwd: string;
  timeoutMs: number;
}): Promise<CommandResult> {
  const process = Bun.spawn(options.cmd, {
    cwd: options.cwd,
    stdin: "ignore",
    stdout: "pipe",
    stderr: "pipe",
  });
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    process.kill();
  }, options.timeoutMs);
  const [stdout, stderr, code] = await Promise.all([
    streamToText(process.stdout),
    streamToText(process.stderr),
    process.exited,
  ]);
  clearTimeout(timer);
  return { code, stdout, stderr, timedOut };
}

async function streamToText(stream?: ReadableStream): Promise<string> {
  if (!stream) {
    return "";
  }
  return new Response(stream).text();
}

function selectHook(
  hooks: WorkspaceHooks,
  name: "after_create" | "before_run" | "after_run" | "before_remove",
): string | undefined {
  switch (name) {
    case "after_create":
      return hooks.afterCreate;
    case "before_run":
      return hooks.beforeRun;
    case "after_run":
      return hooks.afterRun;
    case "before_remove":
      return hooks.beforeRemove;
  }
}
