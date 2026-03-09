export function buildCodingPrompt(task: string, planFilePath: string): string {
  return [
    "You are a coding agent working in an automated loop.",
    "",
    `Task: ${task}`,
    `Execution plan: ${planFilePath}`,
    "",
    "Complete exactly one milestone per iteration.",
    "Update the plan file after finishing the milestone.",
    "Commit code and plan changes together.",
    `Only output ${"<promise>COMPLETE</promise>"} when every milestone is done.`,
  ].join("\n");
}
