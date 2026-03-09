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
});

test("turn start request includes prompt text", () => {
  const request = createTurnStartRequest("thr_123", "hello");
  expect(request.params.threadId).toBe("thr_123");
});
