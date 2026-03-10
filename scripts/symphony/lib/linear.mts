export type BlockerRef = {
  id: string | null;
  identifier: string | null;
  state: string | null;
};

export type NormalizedIssue = {
  id: string;
  identifier: string;
  title: string;
  description: string | null;
  priority: number | null;
  state: string;
  team_id: string | null;
  branch_name: string | null;
  url: string | null;
  labels: string[];
  blocked_by: BlockerRef[];
  created_at: string | null;
  updated_at: string | null;
};

export class TrackerError extends Error {
  code: string;

  constructor(code: string, message: string) {
    super(message);
    this.code = code;
    this.name = "TrackerError";
  }
}

export function normalizeLinearIssue(node: Record<string, unknown>): NormalizedIssue {
  return {
    id: stringOrEmpty(node.id),
    identifier: stringOrEmpty(node.identifier),
    title: stringOrEmpty(node.title),
    description: nullableString(node.description),
    priority: integerOrNull(node.priority),
    state: extractStateName(node.state),
    team_id: nullableString(objectValue(node.team).id),
    branch_name: nullableString(node.branchName ?? node.branch_name),
    url: nullableString(node.url),
    labels: extractLabels(node).map((label) => label.toLowerCase()),
    blocked_by: extractBlockers(node),
    created_at: nullableTimestamp(node.createdAt ?? node.created_at),
    updated_at: nullableTimestamp(node.updatedAt ?? node.updated_at),
  };
}

export function createLinearTracker(options: {
  endpoint: string;
  apiKey: string;
  projectSlug: string;
  activeStates: string[];
  terminalStates: string[];
  fetchImpl?: typeof fetch;
}): {
  fetchCandidateIssues: () => Promise<NormalizedIssue[]>;
  fetchIssuesByStates: (states: string[]) => Promise<NormalizedIssue[]>;
  fetchIssueStatesByIds: (ids: string[]) => Promise<NormalizedIssue[]>;
  updateIssue: (options: {
    issueId: string;
    stateId?: string;
    assigneeId?: string;
  }) => Promise<void>;
  createComment: (options: { issueId: string; body: string }) => Promise<void>;
  getViewer: () => Promise<{ id: string; name: string | null; email: string | null }>;
  resolveWorkflowStateId: (options: { teamId: string; stateName: string }) => Promise<string | null>;
} {
  const fetchImpl = options.fetchImpl ?? fetch;
  const stateIdCache = new Map<string, string | null>();
  let viewerPromise: Promise<{ id: string; name: string | null; email: string | null }> | undefined;

  return {
    fetchCandidateIssues: async () => {
      const issues: NormalizedIssue[] = [];
      let cursor: string | null = null;

      while (true) {
        const payload = await requestGraphql(fetchImpl, options.endpoint, options.apiKey, {
          query: CANDIDATE_ISSUES_QUERY,
          variables: {
            projectSlug: options.projectSlug,
            states: options.activeStates,
            cursor,
            first: 50,
          },
        });
        const connection = issuesConnection(payload);
        issues.push(...connection.nodes.map(normalizeLinearIssue));

        if (!connection.pageInfo.hasNextPage) {
          return issues;
        }
        if (!connection.pageInfo.endCursor) {
          throw new TrackerError(
            "linear_missing_end_cursor",
            "candidate query reported hasNextPage without an end cursor",
          );
        }
        cursor = connection.pageInfo.endCursor;
      }
    },
    fetchIssuesByStates: async (states: string[]) => {
      if (states.length === 0) {
        return [];
      }
      const payload = await requestGraphql(fetchImpl, options.endpoint, options.apiKey, {
        query: ISSUES_BY_STATES_QUERY,
        variables: {
          projectSlug: options.projectSlug,
          states,
        },
      });
      return issuesConnection(payload).nodes.map(normalizeLinearIssue);
    },
    fetchIssueStatesByIds: async (ids: string[]) => {
      if (ids.length === 0) {
        return [];
      }
      const payload = await requestGraphql(fetchImpl, options.endpoint, options.apiKey, {
        query: ISSUE_STATES_BY_IDS_QUERY,
        variables: { ids },
      });
      const nodes = arrayValue(objectValue(payload.data).issues?.nodes);
      return nodes.map((node) => normalizeLinearIssue(objectValue(node)));
    },
    updateIssue: async ({ issueId, stateId, assigneeId }) => {
      if (!stateId && !assigneeId) {
        return;
      }
      await requestGraphql(fetchImpl, options.endpoint, options.apiKey, {
        query: ISSUE_UPDATE_MUTATION,
        variables: {
          id: issueId,
          input: {
            ...(stateId ? { stateId } : {}),
            ...(assigneeId ? { assigneeId } : {}),
          },
        },
      });
    },
    createComment: async ({ issueId, body }) => {
      if (!body.trim()) {
        return;
      }
      await requestGraphql(fetchImpl, options.endpoint, options.apiKey, {
        query: COMMENT_CREATE_MUTATION,
        variables: {
          input: {
            issueId,
            body,
          },
        },
      });
    },
    getViewer: async () => {
      viewerPromise ??= (async () => {
        const payload = await requestGraphql(fetchImpl, options.endpoint, options.apiKey, {
          query: VIEWER_QUERY,
          variables: {},
        });
        const viewer = objectValue(objectValue(payload.data).viewer);
        const id = stringOrEmpty(viewer.id);
        if (!id) {
          throw new TrackerError("linear_unknown_payload", "viewer payload missing id");
        }
        return {
          id,
          name: nullableString(viewer.name),
          email: nullableString(viewer.email),
        };
      })();
      return viewerPromise;
    },
    resolveWorkflowStateId: async ({ teamId, stateName }) => {
      const cacheKey = `${teamId}:${stateName.trim().toLowerCase()}`;
      if (stateIdCache.has(cacheKey)) {
        return stateIdCache.get(cacheKey) ?? null;
      }
      const payload = await requestGraphql(fetchImpl, options.endpoint, options.apiKey, {
        query: WORKFLOW_STATES_QUERY,
        variables: {},
      });
      const nodes = arrayValue(objectValue(objectValue(payload.data).workflowStates).nodes);
      const match =
        nodes
          .map((node) => objectValue(node))
          .find(
            (node) =>
              nullableString(objectValue(node.team).id) === teamId &&
              extractStateName(node).toLowerCase() === stateName.trim().toLowerCase(),
          ) ?? null;
      const stateId = match ? stringOrEmpty(match.id) || null : null;
      stateIdCache.set(cacheKey, stateId);
      return stateId;
    },
  };
}

async function requestGraphql(
  fetchImpl: typeof fetch,
  endpoint: string,
  apiKey: string,
  body: { query: string; variables: Record<string, unknown> },
): Promise<Record<string, unknown>> {
  let response: Response;
  try {
    response = await fetchImpl(endpoint, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: apiKey,
      },
      body: JSON.stringify(body),
    });
  } catch (error) {
    throw new TrackerError(
      "linear_api_request",
      error instanceof Error ? error.message : "request failed",
    );
  }

  if (!response.ok) {
    throw new TrackerError("linear_api_status", `linear returned HTTP ${response.status}`);
  }

  const payload = (await response.json()) as Record<string, unknown>;
  if (Array.isArray(payload.errors) && payload.errors.length > 0) {
    throw new TrackerError("linear_graphql_errors", "linear returned graphql errors");
  }
  if (!objectValue(payload.data)) {
    throw new TrackerError("linear_unknown_payload", "linear payload did not include data");
  }
  return payload;
}

function issuesConnection(payload: Record<string, unknown>): {
  nodes: Record<string, unknown>[];
  pageInfo: { hasNextPage: boolean; endCursor: string | null };
} {
  const connection = objectValue(objectValue(payload.data).issues);
  return {
    nodes: arrayValue(connection.nodes).map((node) => objectValue(node)),
    pageInfo: {
      hasNextPage: Boolean(objectValue(connection.pageInfo).hasNextPage),
      endCursor: nullableString(objectValue(connection.pageInfo).endCursor),
    },
  };
}

function extractLabels(node: Record<string, unknown>): string[] {
  const labels = objectValue(node.labels);
  return arrayValue(labels.nodes)
    .map((entry) => nullableString(objectValue(entry).name))
    .filter((entry): entry is string => Boolean(entry));
}

function extractBlockers(node: Record<string, unknown>): BlockerRef[] {
  const inverseRelations = objectValue(node.inverseRelations ?? node.relations);
  return arrayValue(inverseRelations.nodes)
    .map((entry) => objectValue(entry))
    .filter((entry) => nullableString(entry.type) === "blocks")
    .map((entry) => objectValue(entry.relatedIssue ?? entry.issue ?? entry.sourceIssue))
    .map((issue) => ({
      id: nullableString(issue.id),
      identifier: nullableString(issue.identifier),
      state: extractStateName(issue.state) || null,
    }));
}

function extractStateName(value: unknown): string {
  if (typeof value === "string") {
    return value.trim();
  }
  return nullableString(objectValue(value).name) ?? "";
}

function objectValue(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function arrayValue(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function nullableString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

function stringOrEmpty(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function integerOrNull(value: unknown): number | null {
  return typeof value === "number" && Number.isInteger(value) ? value : null;
}

function nullableTimestamp(value: unknown): string | null {
  if (typeof value !== "string" || !value.trim()) {
    return null;
  }
  return Number.isNaN(Date.parse(value)) ? null : value;
}

const CANDIDATE_ISSUES_QUERY = `
query CandidateIssues($projectSlug: String!, $states: [String!], $cursor: String, $first: Int!) {
  issues(
    first: $first
    after: $cursor
    filter: {
      project: { slugId: { eq: $projectSlug } }
      state: { name: { in: $states } }
    }
  ) {
    nodes {
      id
      identifier
      title
      description
      priority
      branchName
      url
      createdAt
      updatedAt
      team { id }
      state { name }
      labels { nodes { name } }
      inverseRelations {
        nodes {
          type
          relatedIssue {
            id
            identifier
            state { name }
          }
        }
      }
    }
    pageInfo {
      hasNextPage
      endCursor
    }
  }
}
`;

const ISSUES_BY_STATES_QUERY = `
query IssuesByStates($projectSlug: String!, $states: [String!]) {
  issues(
    filter: {
      project: { slugId: { eq: $projectSlug } }
      state: { name: { in: $states } }
    }
  ) {
    nodes {
      id
      identifier
      title
      team { id }
      state { name }
    }
    pageInfo {
      hasNextPage
      endCursor
    }
  }
}
`;

const ISSUE_STATES_BY_IDS_QUERY = `
query IssueStatesByIds($ids: [ID!]) {
  issues(filter: { id: { in: $ids } }) {
    nodes {
      id
      identifier
      title
      team { id }
      state { name }
      priority
      updatedAt
    }
  }
}
`;

const ISSUE_UPDATE_MUTATION = `
mutation IssueUpdate($id: String!, $input: IssueUpdateInput!) {
  issueUpdate(id: $id, input: $input) {
    success
  }
}
`;

const COMMENT_CREATE_MUTATION = `
mutation CommentCreate($input: CommentCreateInput!) {
  commentCreate(input: $input) {
    success
  }
}
`;

const VIEWER_QUERY = `
query Viewer {
  viewer {
    id
    name
    email
  }
}
`;

const WORKFLOW_STATES_QUERY = `
query WorkflowStates {
  workflowStates {
    nodes {
      id
      name
      team {
        id
      }
    }
  }
}
`;
