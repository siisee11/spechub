import { expect, test } from "bun:test";

import { createLinearTracker, normalizeLinearIssue, TrackerError } from "./lib/linear.mts";

test("linear issue normalization lowercases labels and extracts blockers", () => {
  const issue = normalizeLinearIssue({
    id: "1",
    identifier: "ABC-1",
    title: "Fix bug",
    description: "Body",
    priority: 2,
    branchName: "feature",
    url: "https://linear.app/issue/1",
    createdAt: "2026-03-10T00:00:00Z",
    updatedAt: "2026-03-10T00:00:00Z",
    team: { id: "team-1" },
    state: { name: "Todo" },
    labels: { nodes: [{ name: "Bug" }, { name: "P1" }] },
    inverseRelations: {
      nodes: [
        {
          type: "blocks",
          relatedIssue: {
            id: "2",
            identifier: "ABC-2",
            state: { name: "In Progress" },
          },
        },
      ],
    },
  });

  expect(issue.labels).toEqual(["bug", "p1"]);
  expect(issue.team_id).toBe("team-1");
  expect(issue.blocked_by).toEqual([
    { id: "2", identifier: "ABC-2", state: "In Progress" },
  ]);
});

test("linear tracker paginates candidate issues and skips empty state fetches", async () => {
  const requests: Array<Record<string, unknown>> = [];
  const tracker = createLinearTracker({
    endpoint: "https://linear.test/graphql",
    apiKey: "token",
    projectSlug: "app",
    activeStates: ["Todo"],
    terminalStates: ["Done"],
    fetchImpl: async (_input, init) => {
      requests.push(JSON.parse(String(init?.body)));
      const cursor = (requests.at(-1)?.variables as Record<string, unknown>)?.cursor;
      const body =
        cursor === null
          ? {
              data: {
                issues: {
                  nodes: [{ id: "1", identifier: "ABC-1", title: "One", state: { name: "Todo" } }],
                  pageInfo: { hasNextPage: true, endCursor: "next" },
                },
              },
            }
          : {
              data: {
                issues: {
                  nodes: [{ id: "2", identifier: "ABC-2", title: "Two", state: { name: "Todo" } }],
                  pageInfo: { hasNextPage: false, endCursor: null },
                },
              },
            };
      return new Response(JSON.stringify(body), { status: 200 });
    },
  });

  const issues = await tracker.fetchCandidateIssues();
  const none = await tracker.fetchIssuesByStates([]);

  expect(issues.map((issue) => issue.identifier)).toEqual(["ABC-1", "ABC-2"]);
  expect(none).toEqual([]);
  expect(requests).toHaveLength(2);
});

test("linear tracker maps transport and payload errors", async () => {
  const tracker = createLinearTracker({
    endpoint: "https://linear.test/graphql",
    apiKey: "token",
    projectSlug: "app",
    activeStates: ["Todo"],
    terminalStates: ["Done"],
    fetchImpl: async () =>
      new Response(JSON.stringify({ errors: [{ message: "bad" }] }), { status: 200 }),
  });

  await expect(tracker.fetchCandidateIssues()).rejects.toMatchObject({
    code: "linear_graphql_errors",
  });

  const missingCursorTracker = createLinearTracker({
    endpoint: "https://linear.test/graphql",
    apiKey: "token",
    projectSlug: "app",
    activeStates: ["Todo"],
    terminalStates: ["Done"],
    fetchImpl: async () =>
      new Response(
        JSON.stringify({
          data: {
            issues: {
              nodes: [],
              pageInfo: { hasNextPage: true, endCursor: null },
            },
          },
        }),
        { status: 200 },
      ),
  });

  await expect(missingCursorTracker.fetchCandidateIssues()).rejects.toMatchObject<TrackerError>({
    code: "linear_missing_end_cursor",
  });
});

test("linear tracker resolves viewer, workflow states, issue updates, and comments", async () => {
  const requests: Array<Record<string, unknown>> = [];
  const tracker = createLinearTracker({
    endpoint: "https://linear.test/graphql",
    apiKey: "token",
    projectSlug: "app",
    activeStates: ["Todo"],
    terminalStates: ["Done"],
    fetchImpl: async (_input, init) => {
      const request = JSON.parse(String(init?.body)) as Record<string, unknown>;
      requests.push(request);
      const query = String(request.query);
      if (query.includes("query Viewer")) {
        return new Response(
          JSON.stringify({
            data: {
              viewer: {
                id: "user-1",
                name: "Dev",
                email: "dev@example.com",
              },
            },
          }),
          { status: 200 },
        );
      }
      if (query.includes("query WorkflowStates")) {
        return new Response(
          JSON.stringify({
            data: {
              workflowStates: {
                nodes: [
                  {
                    id: "state-1",
                    name: "In Progress",
                    team: { id: "team-1" },
                  },
                ],
              },
            },
          }),
          { status: 200 },
        );
      }
      return new Response(
        JSON.stringify({
          data: {
            issueUpdate: { success: true },
            commentCreate: { success: true },
          },
        }),
        { status: 200 },
      );
    },
  });

  await expect(tracker.getViewer()).resolves.toEqual({
    id: "user-1",
    name: "Dev",
    email: "dev@example.com",
  });
  await expect(
    tracker.resolveWorkflowStateId({
      teamId: "team-1",
      stateName: "In Progress",
    }),
  ).resolves.toBe("state-1");
  await tracker.updateIssue({
    issueId: "issue-1",
    stateId: "state-1",
    assigneeId: "user-1",
  });
  await tracker.createComment({
    issueId: "issue-1",
    body: "hello",
  });

  expect(requests).toHaveLength(4);
  expect(requests[2]?.variables).toEqual({
    id: "issue-1",
    input: {
      stateId: "state-1",
      assigneeId: "user-1",
    },
  });
  expect(requests[3]?.variables).toEqual({
    input: {
      issueId: "issue-1",
      body: "hello",
    },
  });
});
