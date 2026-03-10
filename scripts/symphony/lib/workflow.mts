import { watch } from "node:fs";
import { join } from "node:path";

export type WorkflowDefinition = {
  path: string;
  config: Record<string, unknown>;
  promptTemplate: string;
};

export class WorkflowError extends Error {
  code: string;

  constructor(code: string, message: string) {
    super(message);
    this.code = code;
    this.name = "WorkflowError";
  }
}

export function resolveWorkflowPath(workflowPath?: string, cwd = process.cwd()): string {
  return workflowPath ?? join(cwd, "WORKFLOW.md");
}

export async function loadWorkflowDefinition(options?: {
  workflowPath?: string;
  cwd?: string;
  readFile?: (path: string) => Promise<string>;
}): Promise<WorkflowDefinition> {
  const path = resolveWorkflowPath(options?.workflowPath, options?.cwd);
  const reader =
    options?.readFile ??
    (async (targetPath: string) => {
      const file = Bun.file(targetPath);
      if (!(await file.exists())) {
        throw new WorkflowError("missing_workflow_file", `workflow file not found: ${targetPath}`);
      }
      return file.text();
    });

  const text = await reader(path);
  const parsed = parseWorkflowDefinition(text);
  return { ...parsed, path };
}

export function parseWorkflowDefinition(text: string): Omit<WorkflowDefinition, "path"> {
  const normalized = text.replace(/\r\n/g, "\n");
  if (!normalized.startsWith("---\n")) {
    return {
      config: {},
      promptTemplate: normalized.trim(),
    };
  }

  const closingIndex = normalized.indexOf("\n---\n", 4);
  if (closingIndex < 0) {
    throw new WorkflowError("workflow_parse_error", "workflow front matter is not closed");
  }

  const frontMatter = normalized.slice(4, closingIndex);
  const body = normalized.slice(closingIndex + 5);
  let config: unknown;
  try {
    config = Bun.YAML.parse(frontMatter);
  } catch (error) {
    throw new WorkflowError(
      "workflow_parse_error",
      error instanceof Error ? error.message : "failed to parse workflow front matter",
    );
  }

  if (!isPlainObject(config)) {
    throw new WorkflowError(
      "workflow_front_matter_not_a_map",
      "workflow front matter must decode to a map",
    );
  }

  return {
    config,
    promptTemplate: body.trim(),
  };
}

export function watchWorkflow(
  workflowPath: string,
  onChange: () => void,
): { close: () => void } {
  const watcher = watch(workflowPath, { persistent: false }, () => onChange());
  return {
    close: () => watcher.close(),
  };
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
