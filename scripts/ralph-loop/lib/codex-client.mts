export type JsonRpcRequest = {
  id: number;
  method: string;
  params: Record<string, unknown>;
};

export function createInitializeRequest(): JsonRpcRequest {
  return {
    id: 0,
    method: "initialize",
    params: {
      clientInfo: {
        name: "spechub_ralph_loop",
        title: "SpecHub Ralph Loop",
        version: "0.1.0",
      },
    },
  };
}

export function createThreadStartRequest(model: string, cwd: string): JsonRpcRequest {
  return {
    id: 1,
    method: "thread/start",
    params: {
      model,
      cwd,
      approvalPolicy: "never",
      sandbox: "workspace-write",
    },
  };
}

export function createTurnStartRequest(
  threadId: string,
  prompt: string,
  id = 2,
): JsonRpcRequest {
  return {
    id,
    method: "turn/start",
    params: {
      threadId,
      input: [{ type: "text", text: prompt }],
    },
  };
}
