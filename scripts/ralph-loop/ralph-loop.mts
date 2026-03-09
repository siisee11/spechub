import { appendFile, mkdir } from "node:fs/promises";

import { CodexAppServerClient } from "./lib/codex-client.mts";
import { runRalphLoop } from "./lib/driver.mts";
import { resolveRuntimeRoot, slugifyPrompt } from "./lib/worktree.mts";

type CliOptions = {
  model: string;
  baseBranch: string;
  maxIterations: number;
  workBranch?: string;
  timeout: number;
  approvalPolicy: string;
  sandbox: string;
  prd: boolean;
};

function parseArgs(argv: string[]): CliOptions {
  const options: CliOptions = {
    model: "gpt-5.3-codex",
    baseBranch: "main",
    maxIterations: 20,
    timeout: 21600,
    approvalPolicy: "never",
    sandbox: "workspace-write",
    prd: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = argv[index + 1];
    if (arg === "--model" && next) options.model = next;
    if (arg === "--base-branch" && next) options.baseBranch = next;
    if (arg === "--max-iterations" && next) options.maxIterations = Number(next);
    if (arg === "--work-branch" && next) options.workBranch = next;
    if (arg === "--timeout" && next) options.timeout = Number(next);
    if (arg === "--approval-policy" && next) options.approvalPolicy = next;
    if (arg === "--sandbox" && next) options.sandbox = next;
    if (arg === "--prd") options.prd = true;
  }

  return options;
}

async function readTask(options: CliOptions): Promise<string> {
  if (!options.prd) {
    const prompt = Bun.argv.slice(2).find((value) => !value.startsWith("--"));
    if (!prompt) {
      throw new Error('provide a task prompt or use "--prd"');
    }
    return prompt;
  }

  const prdPath = new URL("../../PRD.md", import.meta.url);
  const text = (await Bun.file(prdPath).text()).trim();
  await Bun.write(prdPath, "");
  return text;
}

class RalphLoopLogger {
  #buffer: string[] = [];
  #logPath?: string;

  async attachRuntimeRoot(runtimeRoot: string): Promise<void> {
    const resolvedRoot = resolveRuntimeRoot(process.cwd(), runtimeRoot);
    await mkdir(`${resolvedRoot}/logs`, { recursive: true });
    this.#logPath = `${resolvedRoot}/logs/ralph-loop.log`;
    if (this.#buffer.length > 0) {
      await Bun.write(this.#logPath, `${this.#buffer.join("\n")}\n`);
      this.#buffer = [];
    }
  }

  async write(line: string): Promise<void> {
    if (!this.#logPath) {
      this.#buffer.push(line);
      return;
    }
    await appendFile(this.#logPath, `${line}\n`);
  }
}

async function main(): Promise<void> {
  const options = parseArgs(Bun.argv.slice(2));
  const task = await readTask(options);
  const logger = new RalphLoopLogger();
  const workBranch = options.workBranch ?? `ralph/${slugifyPrompt(task)}`;

  const outcome = await runRalphLoop(
    {
      task,
      repoRoot: process.cwd(),
      model: options.model,
      baseBranch: options.baseBranch,
      maxIterations: options.maxIterations,
      workBranch,
      approvalPolicy: options.approvalPolicy,
      sandbox: options.sandbox,
      onRuntimeRoot: async (runtimeRoot) => logger.attachRuntimeRoot(runtimeRoot),
      onProgress: (phase) => console.error(`[ralph-loop] ${phase}`),
    },
    async () =>
      CodexAppServerClient.connect({
        logLine: (line) => logger.write(line),
      }),
  );

  console.log(
    JSON.stringify(
      {
        model: options.model,
        baseBranch: options.baseBranch,
        workBranch: outcome.workBranch,
        worktreePath: outcome.worktreePath,
        runtimeRoot: outcome.runtimeRoot,
        planFilePath: outcome.planFilePath,
        iterations: outcome.iterations,
        prAgentOutput: outcome.prAgentOutput,
      },
      null,
      2,
    ),
  );
}

await main();
