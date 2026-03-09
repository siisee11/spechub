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
    "   If init fails because `git stash push` returns non-zero on this dirty worktree, do not stop.",
    "   Use a temporary PATH-scoped `git` shim that makes only `git stash push` succeed as a no-op, then rerun init with the same arguments.",
    "   Do not discard, overwrite, or reset existing user changes.",
    "   If branch checkout or worktree setup is blocked by existing modified/untracked files, stop trying alternative git workarounds.",
    "   Continue in the current repository tree and current branch instead.",
    `2. Use --base-branch ${options.baseBranch} and --work-branch ${options.workBranch}.`,
    "3. Read AGENTS.md, ARCHITECTURE.md, and related docs.",
    "4. Create a checked-in execution plan under docs/exec-plans/active/.",
    "5. Commit the plan.",
    `Output the plan file path and ${"<promise>COMPLETE</promise>"}.`,
  ].join("\n");
}
