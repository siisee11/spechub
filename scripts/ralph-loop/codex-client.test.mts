import { expect, test } from "bun:test";

import {
  createInitializeRequest,
  createThreadStartRequest,
  createTurnStartRequest,
} from "./lib/codex-client.mts";

test("initialize request contains client info", () => {
  expect(createInitializeRequest().params.clientInfo).toBeDefined();
});

test("thread start request contains model and cwd", () => {
  const request = createThreadStartRequest("gpt-5.3-codex", "/tmp/repo");
  expect(request.params.model).toBe("gpt-5.3-codex");
  expect(request.params.cwd).toBe("/tmp/repo");
  expect(request.params.serviceName).toBe("spechub_ralph_loop");
  expect(request.params.sandboxPolicy).toEqual({
    type: "workspaceWrite",
    writableRoots: ["/tmp/repo"],
    networkAccess: true,
  });
});

test("turn start request includes prompt text", () => {
  const request = createTurnStartRequest({
    threadId: "thr_123",
    prompt: "hello",
    cwd: "/tmp/repo",
    approvalPolicy: "never",
    sandbox: "workspace-write",
  });
  expect(request.params.threadId).toBe("thr_123");
  expect(request.params.input).toEqual([{ type: "text", text: "hello" }]);
  expect(request.params.cwd).toBe("/tmp/repo");
  expect(request.params.sandboxPolicy).toEqual({
    type: "workspaceWrite",
    writableRoots: ["/tmp/repo"],
    networkAccess: true,
  });
});
