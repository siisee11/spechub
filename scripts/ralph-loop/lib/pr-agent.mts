export function buildPrPrompt(planFilePath: string, baseBranch: string): string {
  return [
    "You are a PR agent.",
    "",
    `Read the completed plan at ${planFilePath}.`,
    `Review commits with git log ${baseBranch}..HEAD --oneline.`,
    `Review the diff with git diff ${baseBranch}...HEAD --stat.`,
    "Move the plan to docs/exec-plans/completed/.",
    "Create the pull request and enable auto-merge.",
    `Output the PR URL and ${"<promise>COMPLETE</promise>"}.`,
  ].join("\n");
}
