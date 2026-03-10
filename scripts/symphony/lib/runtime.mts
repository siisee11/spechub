import type { SymphonyConfig } from "./config.mts";
import type { NormalizedIssue } from "./linear.mts";

export type WorkerEvent = {
  event: string;
  timestampMs: number;
  sessionId?: string;
  turnId?: string;
  message?: string;
  usage?: {
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
  };
  rateLimits?: unknown;
};

export type WorkerResult = {
  status: "completed" | "failed" | "cancelled";
  error?: string;
};

export type WorkerController = {
  result: Promise<WorkerResult>;
  cancel: (reason: string) => Promise<void> | void;
};

export type WorkerFactory = (options: {
  issue: NormalizedIssue;
  attempt: number | null;
  config: SymphonyConfig;
  onEvent: (event: WorkerEvent) => void;
}) => WorkerController;

export type IssueTracker = {
  fetchCandidateIssues: () => Promise<NormalizedIssue[]>;
  fetchIssuesByStates: (states: string[]) => Promise<NormalizedIssue[]>;
  fetchIssueStatesByIds: (ids: string[]) => Promise<NormalizedIssue[]>;
};

export type Snapshot = {
  generated_at: string;
  counts: {
    running: number;
    retrying: number;
  };
  running: Array<Record<string, unknown>>;
  retrying: Array<Record<string, unknown>>;
  codex_totals: {
    input_tokens: number;
    output_tokens: number;
    total_tokens: number;
    seconds_running: number;
  };
  rate_limits: unknown;
};
