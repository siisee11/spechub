import type { SymphonyConfig } from "./config.mts";
import { normalizeStateName, validateDispatchConfig } from "./config.mts";
import type { NormalizedIssue } from "./linear.mts";
import type { IssueTracker, Snapshot, WorkerController, WorkerEvent, WorkerFactory } from "./runtime.mts";

type RetryEntry = {
  issueId: string;
  identifier: string;
  attempt: number;
  dueAtMs: number;
  handle: unknown;
  error: string | null;
};

type StopReason = {
  kind: "terminal" | "inactive" | "stalled";
};

type RunningEntry = {
  issue: NormalizedIssue;
  controller: WorkerController;
  retryAttempt: number | null;
  startedAtMs: number;
  sessionId: string | null;
  lastCodexEvent: string | null;
  lastCodexTimestampMs: number | null;
  lastCodexMessage: string | null;
  codexInputTokens: number;
  codexOutputTokens: number;
  codexTotalTokens: number;
  lastReportedInputTokens: number;
  lastReportedOutputTokens: number;
  lastReportedTotalTokens: number;
  turnCount: number;
  currentTurnId: string | null;
  stopReason: StopReason | null;
};

type Scheduler = {
  setTimeout: (fn: () => void, delayMs: number) => unknown;
  clearTimeout: (handle: unknown) => void;
};

export class SymphonyOrchestrator {
  #getConfig: () => SymphonyConfig;
  #tracker: IssueTracker;
  #workerFactory: WorkerFactory;
  #workspaceRemover: (issueIdentifier: string) => Promise<void>;
  #scheduler: Scheduler;
  #now: () => number;
  #log: (line: string) => void;

  state = {
    pollIntervalMs: 30000,
    maxConcurrentAgents: 10,
    running: new Map<string, RunningEntry>(),
    claimed: new Set<string>(),
    retryAttempts: new Map<string, RetryEntry>(),
    completed: new Set<string>(),
    codexTotals: {
      inputTokens: 0,
      outputTokens: 0,
      totalTokens: 0,
      secondsRunning: 0,
    },
    codexRateLimits: null as unknown,
  };

  constructor(options: {
    getConfig: () => SymphonyConfig;
    tracker: IssueTracker;
    workerFactory: WorkerFactory;
    workspaceRemover: (issueIdentifier: string) => Promise<void>;
    scheduler?: Scheduler;
    now?: () => number;
    log?: (line: string) => void;
  }) {
    this.#getConfig = options.getConfig;
    this.#tracker = options.tracker;
    this.#workerFactory = options.workerFactory;
    this.#workspaceRemover = options.workspaceRemover;
    this.#scheduler = options.scheduler ?? {
      setTimeout: (fn, delayMs) => setTimeout(fn, delayMs),
      clearTimeout: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
    };
    this.#now = options.now ?? (() => Date.now());
    this.#log = options.log ?? ((line) => console.error(line));
  }

  async startup(): Promise<void> {
    const config = this.#getConfig();
    this.#applyConfig(config);
    this.#info(
      `action=startup outcome=begin workflow_path=${quote(config.workflowPath)} poll_interval_ms=${config.polling.intervalMs} max_concurrent_agents=${config.agent.maxConcurrentAgents}`,
    );
    const errors = validateDispatchConfig(config);
    if (errors.length > 0) {
      this.#error(`action=startup_validate outcome=failed errors=${quote(errors.join(","))}`);
      throw new Error(`startup validation failed: ${errors.join(",")}`);
    }
    try {
      const terminalIssues = await this.#tracker.fetchIssuesByStates(config.tracker.terminalStates);
      this.#info(
        `action=startup_cleanup outcome=begin terminal_issue_count=${terminalIssues.length}`,
      );
      await Promise.all(terminalIssues.map((issue) => this.#workspaceRemover(issue.identifier)));
      this.#info(
        `action=startup_cleanup outcome=completed terminal_issue_count=${terminalIssues.length}`,
      );
    } catch (error) {
      this.#warn(`action=startup_cleanup outcome=failed error=${quote(formatError(error))}`);
    }
    this.#info("action=startup outcome=completed");
  }

  async tick(): Promise<void> {
    const config = this.#getConfig();
    this.#applyConfig(config);
    this.#info(
      `action=tick outcome=begin running=${this.state.running.size} retrying=${this.state.retryAttempts.size}`,
    );
    await this.reconcileRunningIssues(config);

    const errors = validateDispatchConfig(config);
    if (errors.length > 0) {
      this.#error(`action=validate outcome=failed errors=${quote(errors.join(","))}`);
      return;
    }

    let issues: NormalizedIssue[];
    try {
      issues = await this.#tracker.fetchCandidateIssues();
    } catch (error) {
      this.#error(`action=fetch_candidates outcome=failed error=${quote(formatError(error))}`);
      return;
    }
    this.#info(
      `action=fetch_candidates outcome=completed candidate_count=${issues.length} running=${this.state.running.size} retrying=${this.state.retryAttempts.size}`,
    );

    let dispatched = 0;
    for (const issue of sortIssuesForDispatch(issues)) {
      if (availableSlots(this.state, config) <= 0) {
        this.#info("action=dispatch outcome=paused reason=no_available_slots");
        break;
      }
      if (!shouldDispatchIssue(issue, this.state, config)) {
        continue;
      }
      this.dispatchIssue(issue, null, config);
      dispatched += 1;
    }
    this.#info(
      `action=tick outcome=completed candidate_count=${issues.length} dispatched=${dispatched} running=${this.state.running.size} retrying=${this.state.retryAttempts.size}`,
    );
  }

  async stop(): Promise<void> {
    this.#info(
      `action=stop outcome=begin running=${this.state.running.size} retrying=${this.state.retryAttempts.size}`,
    );
    for (const retry of this.state.retryAttempts.values()) {
      this.#scheduler.clearTimeout(retry.handle);
    }
    this.state.retryAttempts.clear();

    const running = [...this.state.running.entries()];
    await Promise.all(
      running.map(async ([issueId, entry]) => {
        entry.stopReason = { kind: "inactive" };
        await entry.controller.cancel("service stopping");
        await entry.controller.result.catch(() => undefined);
        this.state.running.delete(issueId);
      }),
    );
    this.#info("action=stop outcome=completed");
  }

  snapshot(): Snapshot {
    const nowMs = this.#now();
    return {
      generated_at: new Date(nowMs).toISOString(),
      counts: {
        running: this.state.running.size,
        retrying: this.state.retryAttempts.size,
      },
      running: [...this.state.running.entries()].map(([issueId, entry]) => ({
        issue_id: issueId,
        issue_identifier: entry.issue.identifier,
        state: entry.issue.state,
        session_id: entry.sessionId,
        turn_count: entry.turnCount,
        last_event: entry.lastCodexEvent,
        last_message: entry.lastCodexMessage ?? "",
        started_at: new Date(entry.startedAtMs).toISOString(),
        last_event_at: entry.lastCodexTimestampMs
          ? new Date(entry.lastCodexTimestampMs).toISOString()
          : null,
        tokens: {
          input_tokens: entry.codexInputTokens,
          output_tokens: entry.codexOutputTokens,
          total_tokens: entry.codexTotalTokens,
        },
      })),
      retrying: [...this.state.retryAttempts.values()].map((entry) => ({
        issue_id: entry.issueId,
        issue_identifier: entry.identifier,
        attempt: entry.attempt,
        due_at: new Date(entry.dueAtMs).toISOString(),
        error: entry.error,
      })),
      codex_totals: {
        input_tokens: this.state.codexTotals.inputTokens,
        output_tokens: this.state.codexTotals.outputTokens,
        total_tokens: this.state.codexTotals.totalTokens,
        seconds_running: this.state.codexTotals.secondsRunning + liveRunningSeconds(this.state.running, nowMs),
      },
      rate_limits: this.state.codexRateLimits,
    };
  }

  dispatchIssue(issue: NormalizedIssue, attempt: number | null, config = this.#getConfig()): void {
    this.state.claimed.add(issue.id);
    this.#info(
      `action=dispatch outcome=begin issue_id=${quote(issue.id)} issue_identifier=${quote(issue.identifier)} state=${quote(issue.state)} attempt=${attempt ?? 0}`,
    );

    let controller: WorkerController;
    try {
      controller = this.#workerFactory({
        issue,
        attempt,
        config,
        onEvent: (event) => this.#handleWorkerEvent(issue.id, event),
      });
    } catch (error) {
      this.#warn(
        `action=dispatch outcome=failed issue_id=${quote(issue.id)} issue_identifier=${quote(issue.identifier)} error=${quote(formatError(error))}`,
      );
      this.scheduleRetry(issue.id, nextAttempt(attempt), {
        identifier: issue.identifier,
        error: formatError(error),
      }, config);
      return;
    }

    this.state.running.set(issue.id, {
      issue,
      controller,
      retryAttempt: attempt,
      startedAtMs: this.#now(),
      sessionId: null,
      lastCodexEvent: null,
      lastCodexTimestampMs: null,
      lastCodexMessage: null,
      codexInputTokens: 0,
      codexOutputTokens: 0,
      codexTotalTokens: 0,
      lastReportedInputTokens: 0,
      lastReportedOutputTokens: 0,
      lastReportedTotalTokens: 0,
      turnCount: 0,
      currentTurnId: null,
      stopReason: null,
    });
    const pendingRetry = this.state.retryAttempts.get(issue.id);
    if (pendingRetry) {
      this.#scheduler.clearTimeout(pendingRetry.handle);
      this.state.retryAttempts.delete(issue.id);
    }
    this.#info(
      `action=dispatch outcome=running issue_id=${quote(issue.id)} issue_identifier=${quote(issue.identifier)} running=${this.state.running.size}`,
    );

    void controller.result.then(
      (result) => this.#handleWorkerExit(issue.id, result),
      (error) =>
        this.#handleWorkerExit(issue.id, {
          status: "failed",
          error: formatError(error),
        }),
    );
  }

  scheduleRetry(
    issueId: string,
    attempt: number,
    metadata: { identifier: string; error?: string; continuation?: boolean },
    config = this.#getConfig(),
  ): void {
    const existing = this.state.retryAttempts.get(issueId);
    if (existing) {
      this.#scheduler.clearTimeout(existing.handle);
    }
    this.state.claimed.add(issueId);
    const delayMs = metadata.continuation
      ? 1000
      : Math.min(10000 * 2 ** Math.max(attempt - 1, 0), config.agent.maxRetryBackoffMs);
    const dueAtMs = this.#now() + delayMs;
    const handle = this.#scheduler.setTimeout(() => {
      void this.onRetryTimer(issueId);
    }, delayMs);
    this.state.retryAttempts.set(issueId, {
      issueId,
      identifier: metadata.identifier,
      attempt,
      dueAtMs,
      handle,
      error: metadata.error ?? null,
    });
    this.#info(
      `action=retry_schedule outcome=queued issue_id=${quote(issueId)} issue_identifier=${quote(metadata.identifier)} attempt=${attempt} delay_ms=${delayMs} error=${quote(metadata.error ?? "")}`,
    );
  }

  async onRetryTimer(issueId: string): Promise<void> {
    const retry = this.state.retryAttempts.get(issueId);
    if (!retry) {
      return;
    }
    this.state.retryAttempts.delete(issueId);
    this.#info(
      `action=retry_fire outcome=begin issue_id=${quote(issueId)} issue_identifier=${quote(retry.identifier)} attempt=${retry.attempt}`,
    );

    let issues: NormalizedIssue[];
    try {
      issues = await this.#tracker.fetchCandidateIssues();
    } catch {
      this.scheduleRetry(issueId, retry.attempt + 1, {
        identifier: retry.identifier,
        error: "retry poll failed",
      });
      return;
    }

    const issue = issues.find((entry) => entry.id === issueId);
    if (!issue) {
      this.state.claimed.delete(issueId);
      this.#info(
        `action=retry_fire outcome=released issue_id=${quote(issueId)} issue_identifier=${quote(retry.identifier)} reason=issue_not_candidate`,
      );
      return;
    }
    const config = this.#getConfig();
    if (!hasAvailableSlotsForIssue(issue, this.state, config)) {
      this.scheduleRetry(issueId, retry.attempt + 1, {
        identifier: issue.identifier,
        error: "no available orchestrator slots",
      }, config);
      return;
    }

    this.#info(
      `action=retry_fire outcome=dispatch issue_id=${quote(issue.id)} issue_identifier=${quote(issue.identifier)} attempt=${retry.attempt}`,
    );
    this.dispatchIssue(issue, retry.attempt, config);
  }

  async reconcileRunningIssues(config = this.#getConfig()): Promise<void> {
    if (config.codex.stallTimeoutMs > 0) {
      for (const entry of this.state.running.values()) {
        const basis = entry.lastCodexTimestampMs ?? entry.startedAtMs;
        if (this.#now() - basis > config.codex.stallTimeoutMs) {
          entry.stopReason = { kind: "stalled" };
          this.#warn(
            `action=reconcile outcome=stalled issue_id=${quote(entry.issue.id)} issue_identifier=${quote(entry.issue.identifier)} elapsed_ms=${this.#now() - basis}`,
          );
          await entry.controller.cancel("stalled");
        }
      }
    }

    if (this.state.running.size === 0) {
      return;
    }

    let refreshed: NormalizedIssue[];
    try {
      refreshed = await this.#tracker.fetchIssueStatesByIds([...this.state.running.keys()]);
    } catch (error) {
      this.#warn(`action=reconcile outcome=deferred error=${quote(formatError(error))}`);
      return;
    }

    const refreshedById = new Map(refreshed.map((issue) => [issue.id, issue]));
    for (const [issueId, entry] of this.state.running.entries()) {
      const issue = refreshedById.get(issueId);
      if (!issue) {
        continue;
      }
      const normalizedState = normalizeStateName(issue.state);
      if (config.tracker.terminalStateSet.has(normalizedState)) {
        entry.issue = issue;
        entry.stopReason = { kind: "terminal" };
        this.#info(
          `action=reconcile outcome=cancel issue_id=${quote(issue.id)} issue_identifier=${quote(issue.identifier)} reason=terminal state=${quote(issue.state)}`,
        );
        await entry.controller.cancel("terminal");
        continue;
      }
      if (config.tracker.activeStateSet.has(normalizedState)) {
        entry.issue = issue;
        continue;
      }
      entry.issue = issue;
      entry.stopReason = { kind: "inactive" };
      this.#info(
        `action=reconcile outcome=cancel issue_id=${quote(issue.id)} issue_identifier=${quote(issue.identifier)} reason=inactive state=${quote(issue.state)}`,
      );
      await entry.controller.cancel("inactive");
    }
  }

  #applyConfig(config: SymphonyConfig): void {
    this.state.pollIntervalMs = config.polling.intervalMs;
    this.state.maxConcurrentAgents = config.agent.maxConcurrentAgents;
  }

  #handleWorkerEvent(issueId: string, event: WorkerEvent): void {
    const entry = this.state.running.get(issueId);
    if (!entry) {
      return;
    }
    entry.lastCodexEvent = event.event;
    entry.lastCodexTimestampMs = event.timestampMs;
    entry.lastCodexMessage = event.message ?? null;
    if (event.sessionId) {
      entry.sessionId = event.sessionId;
    }
    if (event.turnId && event.turnId !== entry.currentTurnId) {
      entry.currentTurnId = event.turnId;
      entry.turnCount += 1;
    }
    if (event.usage) {
      const inputDelta = Math.max(event.usage.inputTokens - entry.lastReportedInputTokens, 0);
      const outputDelta = Math.max(event.usage.outputTokens - entry.lastReportedOutputTokens, 0);
      const totalDelta = Math.max(event.usage.totalTokens - entry.lastReportedTotalTokens, 0);
      entry.lastReportedInputTokens = event.usage.inputTokens;
      entry.lastReportedOutputTokens = event.usage.outputTokens;
      entry.lastReportedTotalTokens = event.usage.totalTokens;
      entry.codexInputTokens += inputDelta;
      entry.codexOutputTokens += outputDelta;
      entry.codexTotalTokens += totalDelta;
      this.state.codexTotals.inputTokens += inputDelta;
      this.state.codexTotals.outputTokens += outputDelta;
      this.state.codexTotals.totalTokens += totalDelta;
    }
    if (event.rateLimits !== undefined) {
      this.state.codexRateLimits = event.rateLimits;
    }
    if (shouldLogWorkerEvent(event)) {
      this.#info(
        `action=worker_event outcome=observed issue_id=${quote(issueId)} issue_identifier=${quote(entry.issue.identifier)} event=${quote(event.event)} session_id=${quote(entry.sessionId ?? "")} turn_id=${quote(event.turnId ?? "")} message=${quote(event.message ?? "")}`,
      );
    }
  }

  async #handleWorkerExit(issueId: string, result: { status: string; error?: string }): Promise<void> {
    const entry = this.state.running.get(issueId);
    if (!entry) {
      return;
    }
    this.state.running.delete(issueId);
    this.state.codexTotals.secondsRunning += (this.#now() - entry.startedAtMs) / 1000;

    if (entry.stopReason?.kind === "terminal") {
      this.state.completed.add(issueId);
      this.state.claimed.delete(issueId);
      await this.#workspaceRemover(entry.issue.identifier);
      this.#info(
        `action=worker_exit outcome=terminal_cleanup issue_id=${quote(issueId)} issue_identifier=${quote(entry.issue.identifier)}`,
      );
      return;
    }
    if (entry.stopReason?.kind === "inactive") {
      this.state.claimed.delete(issueId);
      this.#info(
        `action=worker_exit outcome=released issue_id=${quote(issueId)} issue_identifier=${quote(entry.issue.identifier)} reason=inactive`,
      );
      return;
    }
    if (entry.stopReason?.kind === "stalled") {
      this.#warn(
        `action=worker_exit outcome=retrying issue_id=${quote(issueId)} issue_identifier=${quote(entry.issue.identifier)} reason=stalled`,
      );
      this.scheduleRetry(issueId, nextAttempt(entry.retryAttempt), {
        identifier: entry.issue.identifier,
        error: "stalled",
      });
      return;
    }

    if (result.status === "completed") {
      this.state.completed.add(issueId);
      this.#info(
        `action=worker_exit outcome=completed issue_id=${quote(issueId)} issue_identifier=${quote(entry.issue.identifier)} turns=${entry.turnCount}`,
      );
      this.scheduleRetry(issueId, 1, {
        identifier: entry.issue.identifier,
        continuation: true,
      });
      return;
    }

    this.#warn(
      `action=worker_exit outcome=retrying issue_id=${quote(issueId)} issue_identifier=${quote(entry.issue.identifier)} reason=${quote(result.error ?? "worker failed")}`,
    );
    this.scheduleRetry(issueId, nextAttempt(entry.retryAttempt), {
      identifier: entry.issue.identifier,
      error: result.error ?? "worker failed",
    });
  }

  #info(fields: string): void {
    this.#log(`level=info ${fields}`);
  }

  #warn(fields: string): void {
    this.#log(`level=warn ${fields}`);
  }

  #error(fields: string): void {
    this.#log(`level=error ${fields}`);
  }
}

export function shouldDispatchIssue(
  issue: NormalizedIssue,
  state: SymphonyOrchestrator["state"],
  config: SymphonyConfig,
): boolean {
  if (!issue.id || !issue.identifier || !issue.title || !issue.state) {
    return false;
  }
  const normalizedState = normalizeStateName(issue.state);
  if (
    !config.tracker.activeStateSet.has(normalizedState) ||
    config.tracker.terminalStateSet.has(normalizedState)
  ) {
    return false;
  }
  if (state.running.has(issue.id) || state.claimed.has(issue.id)) {
    return false;
  }
  if (!hasAvailableSlotsForIssue(issue, state, config)) {
    return false;
  }
  if (
    normalizedState === "todo" &&
    issue.blocked_by.some(
      (blocker) =>
        blocker.state !== null && !config.tracker.terminalStateSet.has(normalizeStateName(blocker.state)),
    )
  ) {
    return false;
  }
  return true;
}

export function sortIssuesForDispatch(issues: NormalizedIssue[]): NormalizedIssue[] {
  return [...issues].sort((left, right) => {
    const priorityDelta = normalizedPriority(left.priority) - normalizedPriority(right.priority);
    if (priorityDelta !== 0) {
      return priorityDelta;
    }
    const createdLeft = left.created_at ? Date.parse(left.created_at) : Number.MAX_SAFE_INTEGER;
    const createdRight = right.created_at ? Date.parse(right.created_at) : Number.MAX_SAFE_INTEGER;
    if (createdLeft !== createdRight) {
      return createdLeft - createdRight;
    }
    return left.identifier.localeCompare(right.identifier);
  });
}

export function availableSlots(
  state: SymphonyOrchestrator["state"],
  config: SymphonyConfig,
): number {
  return Math.max(config.agent.maxConcurrentAgents - state.running.size, 0);
}

function hasAvailableSlotsForIssue(
  issue: NormalizedIssue,
  state: SymphonyOrchestrator["state"],
  config: SymphonyConfig,
): boolean {
  if (availableSlots(state, config) <= 0) {
    return false;
  }
  const normalizedState = normalizeStateName(issue.state);
  const limit =
    config.agent.maxConcurrentAgentsByState[normalizedState] ?? config.agent.maxConcurrentAgents;
  const runningInState = [...state.running.values()].filter(
    (entry) => normalizeStateName(entry.issue.state) === normalizedState,
  ).length;
  return runningInState < limit;
}

function normalizedPriority(priority: number | null): number {
  return priority ?? Number.MAX_SAFE_INTEGER;
}

function nextAttempt(currentAttempt: number | null): number {
  return (currentAttempt ?? 0) + 1;
}

function liveRunningSeconds(running: Map<string, RunningEntry>, nowMs: number): number {
  let total = 0;
  for (const entry of running.values()) {
    total += (nowMs - entry.startedAtMs) / 1000;
  }
  return total;
}

function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function quote(value: string): string {
  return JSON.stringify(value);
}

function shouldLogWorkerEvent(event: WorkerEvent): boolean {
  return [
    "worker_phase",
    "workspace_ready",
    "runtime_root",
    "turn_completed",
    "turn_failed",
    "notification",
  ].includes(event.event);
}
