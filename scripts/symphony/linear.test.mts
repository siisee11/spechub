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
