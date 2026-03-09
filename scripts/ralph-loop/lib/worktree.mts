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

export function extractInitOutputFromItems(
  items: Array<Record<string, unknown>>,
): InitOutput | undefined {
  for (const item of items) {
    if (item.type !== "commandExecution") {
      continue;
    }
    if (typeof item.aggregatedOutput !== "string") {
      continue;
    }
    const parsed = tryParseInitOutput(item.aggregatedOutput);
    if (parsed) {
      return parsed;
    }
  }
  return undefined;
}

export function extractPlanFilePath(
  text: string,
  worktreePath?: string,
): string | undefined {
  const trimmed = text.trim();
  const absoluteMatch = trimmed.match(/(?:^|\s)(\/[^\s<>]+\.md)\b/);
  if (absoluteMatch?.[1]) {
    return absoluteMatch[1];
  }

  const relativeMatch = trimmed.match(/\b(docs\/exec-plans\/(?:active|completed)\/[^\s<>]+\.md)\b/);
  if (!relativeMatch?.[1]) {
    return undefined;
  }
  if (!worktreePath) {
    return relativeMatch[1];
  }
  return `${worktreePath}/${relativeMatch[1]}`;
}

export function resolveRuntimeRoot(worktreePath: string, runtimeRoot: string): string {
  if (runtimeRoot.startsWith("/")) {
    return runtimeRoot;
  }
  return `${worktreePath}/${runtimeRoot.replace(/^\.?\//, "")}`;
}

export function slugifyPrompt(prompt: string): string {
  return prompt
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

function tryParseInitOutput(text: string): InitOutput | undefined {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end < 0 || end < start) {
    return undefined;
  }
  try {
    return parseInitOutput(text.slice(start, end + 1));
  } catch {
    return undefined;
  }
}
