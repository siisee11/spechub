export type InitOutput = {
  worktree_id: string;
  worktree_path: string;
  work_branch: string;
  base_branch: string;
  deps_installed: boolean;
  build_verified: boolean;
  runtime_root: string;
};

export function parseInitOutput(json: string): InitOutput {
  const data = JSON.parse(json) as InitOutput;
  if (!data.worktree_id || !data.worktree_path) {
    throw new Error("init output is missing required fields");
  }
  return data;
}

export function slugifyPrompt(prompt: string): string {
  return prompt
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}
