import type { NormalizedIssue } from "./linear.mts";
import { renderTemplate } from "./template.mts";
import type { IssueLifecycleWriter, WorkerResult } from "./runtime.mts";

type LinearTrackerWriterClient = {
  updateIssue: (options: { issueId: string; stateId?: string; assigneeId?: string }) => Promise<void>;
  createComment: (options: { issueId: string; body: string }) => Promise<void>;
  getViewer: () => Promise<{ id: string }>;
  resolveWorkflowStateId: (options: { teamId: string; stateName: string }) => Promise<string | null>;
};

export function createLinearLifecycleWriter(client: LinearTrackerWriterClient): IssueLifecycleWriter {
  return {
    onDispatch: async ({ issue, attempt, config }) => {
      await applyAction(client, config.linear.dispatch, {
        issue,
        attempt,
        result: null,
        error: null,
      });
    },
    onCompleted: async ({ issue, attempt, config, result }) => {
      await applyAction(client, config.linear.completion, {
        issue,
        attempt,
        result,
        error: null,
      });
    },
    onFailed: async ({ issue, attempt, config, result }) => {
      await applyAction(client, config.linear.failure, {
        issue,
        attempt,
        result: null,
        error: result.error ?? "unknown error",
      });
    },
  };
}

async function applyAction(
  client: LinearTrackerWriterClient,
  action:
    | {
        assignee?: string;
        state?: string;
        comment?: string;
      }
    | undefined,
  context: {
    issue: NormalizedIssue;
    attempt: number | null;
    result: WorkerResult | null;
    error: string | null;
  },
): Promise<void> {
  if (!action) {
    return;
  }

  const assigneeId =
    action.assignee === "viewer"
      ? (await client.getViewer()).id
      : action.assignee;
  const stateId =
    action.state && context.issue.team_id
      ? await client.resolveWorkflowStateId({
          teamId: context.issue.team_id,
          stateName: action.state,
        })
      : undefined;
  await client.updateIssue({
    issueId: context.issue.id,
    stateId: stateId ?? undefined,
    assigneeId,
  });

  if (!action.comment) {
    return;
  }
  const comment = renderTemplate(action.comment, {
    issue: context.issue,
    attempt: context.attempt,
    result: {
      pr_url: context.result?.prUrl ?? "",
      pr_agent_output: context.result?.prAgentOutput ?? "",
    },
    error: context.error ?? "",
  }).trim();
  if (!comment) {
    return;
  }
  await client.createComment({
    issueId: context.issue.id,
    body: comment,
  });
}
