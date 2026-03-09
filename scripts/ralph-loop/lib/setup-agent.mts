type SetupOptions = {
  task: string;
  baseBranch: string;
  workBranch: string;
};

export function buildSetupPrompt(options: SetupOptions): string {
  return [
    "You are the setup agent for an automated coding loop.",
    "",
    `Task: ${options.task}`,
    "",
    "1. Initialize the environment with scripts/harness/init.sh.",
    `2. Use --base-branch ${options.baseBranch} and --work-branch ${options.workBranch}.`,
    "3. Read AGENTS.md, ARCHITECTURE.md, and related docs.",
    "4. Create a checked-in execution plan under docs/exec-plans/active/.",
    "5. Commit the plan.",
    `Output the plan file path and ${"<promise>COMPLETE</promise>"}.`,
  ].join("\n");
}
