import { buildCodingPrompt } from "./lib/coding-loop.mts";
import { buildPrPrompt } from "./lib/pr-agent.mts";
import { buildSetupPrompt } from "./lib/setup-agent.mts";
import { slugifyPrompt } from "./lib/worktree.mts";

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

const options = parseArgs(Bun.argv.slice(2));
const task = await readTask(options);
const workBranch = options.workBranch ?? `ralph/${slugifyPrompt(task)}`;

const output = {
  model: options.model,
  baseBranch: options.baseBranch,
  workBranch,
  setupPrompt: buildSetupPrompt({ task, baseBranch: options.baseBranch, workBranch }),
  codingPrompt: buildCodingPrompt(task, `docs/exec-plans/active/${slugifyPrompt(task)}.md`),
  prPrompt: buildPrPrompt(
    `docs/exec-plans/active/${slugifyPrompt(task)}.md`,
    options.baseBranch,
  ),
};

console.log(JSON.stringify(output, null, 2));
