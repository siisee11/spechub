import { SymphonyService } from "./lib/service.mts";

type CliOptions = {
  workflowPath?: string;
  model: string;
  baseBranch: string;
};

function parseArgs(argv: string[]): CliOptions {
  const options: CliOptions = {
    model: "gpt-5.3-codex",
    baseBranch: "main",
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = argv[index + 1];
    if (arg === "--model" && next) {
      options.model = next;
      index += 1;
      continue;
    }
    if (arg === "--base-branch" && next) {
      options.baseBranch = next;
      index += 1;
      continue;
    }
    if (!arg.startsWith("--") && !options.workflowPath) {
      options.workflowPath = arg;
    }
  }

  return options;
}

export function createTerminalLogger(options?: {
  stdout?: (line: string) => void;
  stderr?: (line: string) => void;
  now?: () => string;
}): (line: string) => void {
  const stdout = options?.stdout ?? ((line: string) => console.log(line));
  const stderr = options?.stderr ?? ((line: string) => console.error(line));
  const now = options?.now ?? (() => new Date().toISOString());

  return (line: string) => {
    const formatted = `[symphony ${now()}] ${line}`;
    if (line.includes("level=error")) {
      stderr(formatted);
      return;
    }
    stdout(formatted);
  };
}

async function main(): Promise<void> {
  const options = parseArgs(Bun.argv.slice(2));
  const service = new SymphonyService({
    repoRoot: process.cwd(),
    workflowPath: options.workflowPath,
    model: options.model,
    baseBranch: options.baseBranch,
    logger: createTerminalLogger(),
  });
  await service.start();

  const stop = async () => {
    await service.stop();
    process.exit(0);
  };

  process.on("SIGINT", () => void stop());
  process.on("SIGTERM", () => void stop());
}

if (import.meta.main) {
  await main();
}
