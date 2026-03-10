import { homedir, tmpdir } from "node:os";
import { isAbsolute, join } from "node:path";

import type { WorkflowDefinition } from "./workflow.mts";

export type SymphonyConfig = {
  workflowPath: string;
  promptTemplate: string;
  tracker: {
    kind: string;
    endpoint: string;
    apiKey: string;
    projectSlug: string;
    activeStates: string[];
    terminalStates: string[];
    activeStateSet: Set<string>;
    terminalStateSet: Set<string>;
  };
  polling: {
    intervalMs: number;
  };
  workspace: {
    root: string;
  };
  hooks: {
    afterCreate?: string;
    beforeRun?: string;
    afterRun?: string;
    beforeRemove?: string;
    timeoutMs: number;
  };
  agent: {
    maxConcurrentAgents: number;
    maxTurns: number;
    maxRetryBackoffMs: number;
    maxConcurrentAgentsByState: Record<string, number>;
  };
  codex: {
    command: string;
    approvalPolicy: string;
    threadSandbox: string;
    turnSandboxPolicy: { type: string };
    turnTimeoutMs: number;
    readTimeoutMs: number;
    stallTimeoutMs: number;
  };
  server: {
    port?: number;
  };
  linear: {
    dispatch?: {
      assignee?: string;
      state?: string;
      comment?: string;
    };
    completion?: {
      state?: string;
      comment?: string;
    };
    failure?: {
      state?: string;
      comment?: string;
    };
  };
};

export function normalizeStateName(state: string): string {
  return state.trim().toLowerCase();
}

export function buildSymphonyConfig(
  workflow: WorkflowDefinition,
  options?: {
    env?: Record<string, string | undefined>;
    homeDir?: string;
    tempDir?: string;
  },
): SymphonyConfig {
  const env = options?.env ?? process.env;
  const homeDir = options?.homeDir ?? homedir();
  const tempDir = options?.tempDir ?? tmpdir();
  const tracker = objectValue(workflow.config.tracker);
  const polling = objectValue(workflow.config.polling);
  const workspace = objectValue(workflow.config.workspace);
  const hooks = objectValue(workflow.config.hooks);
  const agent = objectValue(workflow.config.agent);
  const codex = objectValue(workflow.config.codex);
  const server = objectValue(workflow.config.server);
  const linear = objectValue(workflow.config.linear);

  const activeStates = coerceStringList(tracker.active_states, ["Todo", "In Progress"]);
  const terminalStates = coerceStringList(tracker.terminal_states, [
    "Closed",
    "Cancelled",
    "Canceled",
    "Duplicate",
    "Done",
  ]);

  return {
    workflowPath: workflow.path,
    promptTemplate: workflow.promptTemplate || "You are working on an issue from Linear.",
    tracker: {
      kind: stringValue(tracker.kind),
      endpoint:
        stringValue(tracker.endpoint) || "https://api.linear.app/graphql",
      apiKey: resolveEnvValue(stringValue(tracker.api_key), env),
      projectSlug: stringValue(tracker.project_slug),
      activeStates,
      terminalStates,
      activeStateSet: new Set(activeStates.map(normalizeStateName)),
      terminalStateSet: new Set(terminalStates.map(normalizeStateName)),
    },
    polling: {
      intervalMs: positiveInteger(polling.interval_ms, 30000),
    },
    workspace: {
      root: resolvePathValue(
        stringValue(workspace.root) || join(tempDir, "symphony_workspaces"),
        env,
        homeDir,
      ),
    },
    hooks: {
      afterCreate: optionalString(hooks.after_create),
      beforeRun: optionalString(hooks.before_run),
      afterRun: optionalString(hooks.after_run),
      beforeRemove: optionalString(hooks.before_remove),
      timeoutMs: positiveInteger(hooks.timeout_ms, 60000),
    },
    agent: {
      maxConcurrentAgents: positiveInteger(agent.max_concurrent_agents, 10),
      maxTurns: positiveInteger(agent.max_turns, 20),
      maxRetryBackoffMs: positiveInteger(agent.max_retry_backoff_ms, 300000),
      maxConcurrentAgentsByState: coerceStateLimits(agent.max_concurrent_agents_by_state),
    },
    codex: {
      command: stringValue(codex.command) || "codex app-server",
      approvalPolicy: stringValue(codex.approval_policy) || "never",
      threadSandbox: stringValue(codex.thread_sandbox) || "workspace-write",
      turnSandboxPolicy: coerceSandboxPolicy(codex.turn_sandbox_policy),
      turnTimeoutMs: positiveInteger(codex.turn_timeout_ms, 3600000),
      readTimeoutMs: positiveInteger(codex.read_timeout_ms, 5000),
      stallTimeoutMs: integerValue(codex.stall_timeout_ms, 300000),
    },
    server: {
      port: optionalInteger(server.port),
    },
    linear: {
      dispatch: coerceLinearAction(objectValue(linear.dispatch), env),
      completion: coerceLinearAction(objectValue(linear.completion), env),
      failure: coerceLinearAction(objectValue(linear.failure), env),
    },
  };
}

export function validateDispatchConfig(config: SymphonyConfig): string[] {
  const errors: string[] = [];
  if (!config.tracker.kind) {
    errors.push("missing_tracker_kind");
  } else if (config.tracker.kind !== "linear") {
    errors.push("unsupported_tracker_kind");
  }
  if (!config.tracker.apiKey) {
    errors.push("missing_tracker_api_key");
  }
  if (!config.tracker.projectSlug) {
    errors.push("missing_tracker_project_slug");
  }
  if (!config.codex.command.trim()) {
    errors.push("missing_codex_command");
  }
  return errors;
}

function resolveEnvValue(
  value: string,
  env: Record<string, string | undefined>,
): string {
  if (!value.startsWith("$")) {
    return value;
  }
  return env[value.slice(1)]?.trim() ?? "";
}

function resolvePathValue(
  value: string,
  env: Record<string, string | undefined>,
  homeDir: string,
): string {
  const envResolved = resolveEnvValue(value, env) || value;
  if (envResolved.startsWith("~")) {
    return join(homeDir, envResolved.slice(1));
  }
  if (isAbsolute(envResolved) || envResolved.includes("/")) {
    return envResolved;
  }
  return envResolved;
}

function coerceStringList(value: unknown, fallback: string[]): string[] {
  if (Array.isArray(value)) {
    return value
      .map((entry) => (typeof entry === "string" ? entry.trim() : ""))
      .filter(Boolean);
  }
  if (typeof value === "string" && value.trim()) {
    return value
      .split(",")
      .map((entry) => entry.trim())
      .filter(Boolean);
  }
  return [...fallback];
}

function coerceStateLimits(value: unknown): Record<string, number> {
  if (!isRecord(value)) {
    return {};
  }
  const limits: Record<string, number> = {};
  for (const [state, rawLimit] of Object.entries(value)) {
    const limit = optionalInteger(rawLimit);
    if (limit && limit > 0) {
      limits[normalizeStateName(state)] = limit;
    }
  }
  return limits;
}

function coerceSandboxPolicy(value: unknown): { type: string } {
  if (typeof value === "string" && value.trim()) {
    return { type: value.trim() };
  }
  if (isRecord(value) && typeof value.type === "string" && value.type.trim()) {
    return { type: value.type.trim() };
  }
  return { type: "workspace-write" };
}

function coerceLinearAction(
  value: Record<string, unknown>,
  env: Record<string, string | undefined>,
): { assignee?: string; state?: string; comment?: string } | undefined {
  const assignee = resolveEnvValue(stringValue(value.assignee), env);
  const state = stringValue(value.state);
  const comment = optionalString(value.comment);
  if (!assignee && !state && !comment) {
    return undefined;
  }
  return {
    assignee: assignee || undefined,
    state: state || undefined,
    comment,
  };
}

function objectValue(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringValue(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function optionalString(value: unknown): string | undefined {
  const parsed = stringValue(value);
  return parsed || undefined;
}

function integerValue(value: unknown, fallback: number): number {
  const parsed = optionalInteger(value);
  return parsed ?? fallback;
}

function positiveInteger(value: unknown, fallback: number): number {
  const parsed = optionalInteger(value);
  return parsed && parsed > 0 ? parsed : fallback;
}

function optionalInteger(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isInteger(value)) {
    return value;
  }
  if (typeof value === "string" && /^-?\d+$/.test(value.trim())) {
    return Number.parseInt(value, 10);
  }
  return undefined;
}
