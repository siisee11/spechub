import type { JsonRpcNotification } from "../../ralph-loop/lib/codex-client.mts";
import { CodexAppServerClient } from "../../ralph-loop/lib/codex-client.mts";
import { runRalphLoop } from "../../ralph-loop/lib/driver.mts";
import { renderTemplate } from "./template.mts";
import type { SymphonyConfig } from "./config.mts";
import type { WorkerController, WorkerEvent, WorkerFactory } from "./runtime.mts";
import type { WorkspaceManager } from "./workspace.mts";

type SessionLike = {
  startThread: (options: {
    model: string;
    cwd: string;
    approvalPolicy: string;
    sandbox: string;
  }) => Promise<string>;
  runTurn: (options: {
    threadId: string;
    prompt: string;
    cwd: string;
    approvalPolicy: string;
    sandbox: string;
  }) => Promise<{
    turnId: string;
    status: string;
    agentText: string;
    items: Array<Record<string, unknown>>;
    error?: { message: string };
  }>;
  compactThread: (threadId: string) => Promise<void>;
  close: () => Promise<void>;
};

export function createRalphWorker(options: {
  getWorkspaceManager: (config: SymphonyConfig) => WorkspaceManager;
  model: string;
  baseBranch: string;
  startSession?: (options: {
    cwd: string;
    config: SymphonyConfig;
    onEvent: (event: WorkerEvent) => void;
  }) => Promise<SessionLike>;
  runLoop?: typeof runRalphLoop;
}): WorkerFactory {
  const startSession = options.startSession ?? createRalphSession;
  const runLoop = options.runLoop ?? runRalphLoop;

  return ({ issue, attempt, config, onEvent }): WorkerController => {
    const abortController = new AbortController();
    const workspaceManager = options.getWorkspaceManager(config);
    const result = (async () => {
      let workspacePath: string | null = null;
      try {
        onEvent({
          event: "worker_phase",
          timestampMs: Date.now(),
          message: "preparing_workspace",
        });
        const workspace = await workspaceManager.ensureWorkspace(issue.identifier);
        workspacePath = workspace.path;
        onEvent({
          event: "workspace_ready",
          timestampMs: Date.now(),
          message: workspace.path,
        });
        const prompt = renderTemplate(config.promptTemplate, {
          issue,
          attempt,
        });
        onEvent({
          event: "worker_phase",
          timestampMs: Date.now(),
          message: "before_run_hook",
        });
        await workspaceManager.runHook("before_run", workspace.path, true);
        const outcome = await runLoop(
          {
            task: prompt,
            repoRoot: workspace.path,
            model: options.model,
            baseBranch: options.baseBranch,
            maxIterations: config.agent.maxTurns,
            workBranch: `symphony/${workspace.workspaceKey.toLowerCase()}`,
            approvalPolicy: config.codex.approvalPolicy,
            sandbox: config.codex.threadSandbox,
            signal: abortController.signal,
            onRuntimeRoot: (runtimeRoot) => {
              onEvent({
                event: "runtime_root",
                timestampMs: Date.now(),
                message: runtimeRoot,
              });
            },
            onProgress: (message) => {
              onEvent({
                event: "worker_phase",
                timestampMs: Date.now(),
                message,
              });
            },
          },
          () =>
            startSession({
              cwd: workspace.path,
              config,
              onEvent,
            }),
        );
        return {
          status: "completed" as const,
          prUrl: extractPullRequestUrl(outcome.prAgentOutput),
          prAgentOutput: outcome.prAgentOutput,
        };
      } catch (error) {
        if (abortController.signal.aborted) {
          return {
            status: "cancelled" as const,
            error: abortReason(abortController.signal.reason),
          };
        }
        return {
          status: "failed" as const,
          error: error instanceof Error ? error.message : String(error),
        };
      } finally {
        if (workspacePath) {
          onEvent({
            event: "worker_phase",
            timestampMs: Date.now(),
            message: "after_run_hook",
          });
          await workspaceManager.runHook("after_run", workspacePath, false);
        }
      }
    })();

    return {
      result,
      cancel: async (reason: string) => {
        onEvent({
          event: "worker_phase",
          timestampMs: Date.now(),
          message: `cancel:${reason}`,
        });
        abortController.abort(reason);
      },
    };
  };
}

export async function createRalphSession(options: {
  cwd: string;
  config: SymphonyConfig;
  onEvent: (event: WorkerEvent) => void;
  connect?: typeof CodexAppServerClient.connect;
}): Promise<SessionLike> {
  const client = await (options.connect ?? CodexAppServerClient.connect)({
    command: ["bash", "-lc", options.config.codex.command],
    cwd: options.cwd,
    onNotification: (notification) => {
      const event = notificationToWorkerEvent(notification);
      if (event) {
        options.onEvent(event);
      }
    },
  });
  let currentThreadId: string | null = null;

  return {
    async startThread(startOptions) {
      const threadId = await client.startThread(startOptions);
      currentThreadId = threadId;
      return threadId;
    },
    async runTurn(turnOptions) {
      const result = await client.runTurn(turnOptions);
      options.onEvent({
        event: result.status === "failed" ? "turn_failed" : "turn_completed",
        timestampMs: Date.now(),
        sessionId: currentThreadId ? `${currentThreadId}-${result.turnId}` : undefined,
        turnId: result.turnId,
        message:
          result.status === "failed"
            ? result.error?.message ?? "turn failed"
            : summarizeText(result.agentText),
      });
      return result;
    },
    compactThread: (threadId) => client.compactThread(threadId),
    close: () => client.close(),
  };
}

export function notificationToWorkerEvent(
  notification: JsonRpcNotification,
): WorkerEvent | null {
  const params = notification.params ?? {};
  const item = asRecord(params.item);
  const usage = extractUsage(notification, item);
  const turnId = stringValue(params.turnId) ?? stringValue(asRecord(params.turn).id) ?? stringValue(item.turnId);
  const message =
    stringValue(item.text) ??
    stringValue(params.message) ??
    stringValue(asRecord(params.turn).status);

  if (!usage && !message && !turnId && !("rateLimits" in params) && !("rate_limits" in params)) {
    return null;
  }

  return {
    event: normalizeEventName(notification.method, item),
    timestampMs: Date.now(),
    turnId: turnId ?? undefined,
    message: message ? summarizeText(message) : undefined,
    usage: usage ?? undefined,
    rateLimits: params.rateLimits ?? params.rate_limits,
  };
}

function extractUsage(
  notification: JsonRpcNotification,
  item: Record<string, unknown>,
): { inputTokens: number; outputTokens: number; totalTokens: number } | null {
  const params = notification.params ?? {};
  const candidates = [
    asRecord(params.total_token_usage),
    asRecord(params.totalTokenUsage),
    asRecord(asRecord(params.usage).total_token_usage),
    asRecord(item.total_token_usage),
    asRecord(item.totalTokenUsage),
  ];

  for (const candidate of candidates) {
    const inputTokens = integerValue(candidate.input_tokens ?? candidate.inputTokens);
    const outputTokens = integerValue(candidate.output_tokens ?? candidate.outputTokens);
    const totalTokens = integerValue(candidate.total_tokens ?? candidate.totalTokens);
    if (inputTokens !== null && outputTokens !== null && totalTokens !== null) {
      return { inputTokens, outputTokens, totalTokens };
    }
  }

  return null;
}

function normalizeEventName(method: string, item: Record<string, unknown>): string {
  if (item.type === "agentMessage") {
    return "notification";
  }
  return method.replaceAll("/", "_");
}

function summarizeText(text: string): string {
  return text.trim().slice(0, 160);
}

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

function integerValue(value: unknown): number | null {
  return typeof value === "number" && Number.isInteger(value) ? value : null;
}

function abortReason(reason: unknown): string {
  return typeof reason === "string" && reason ? reason : "cancelled";
}

function extractPullRequestUrl(text: string): string | null {
  const match = text.match(/https:\/\/github\.com\/\S+\/pull\/\d+/);
  return match?.[0] ?? null;
}
