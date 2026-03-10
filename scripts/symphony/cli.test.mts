import { expect, test } from "bun:test";

import { createTerminalLogger } from "./symphony.mts";

test("terminal logger sends info to stdout and errors to stderr", () => {
  const stdout: string[] = [];
  const stderr: string[] = [];
  const logger = createTerminalLogger({
    stdout: (line) => stdout.push(line),
    stderr: (line) => stderr.push(line),
    now: () => "2026-03-10T12:00:00.000Z",
  });

  logger("level=info action=tick outcome=begin");
  logger("level=warn action=reconcile outcome=deferred");
  logger("level=error action=fetch_candidates outcome=failed");

  expect(stdout).toEqual([
    "[symphony 2026-03-10T12:00:00.000Z] level=info action=tick outcome=begin",
    "[symphony 2026-03-10T12:00:00.000Z] level=warn action=reconcile outcome=deferred",
  ]);
  expect(stderr).toEqual([
    "[symphony 2026-03-10T12:00:00.000Z] level=error action=fetch_candidates outcome=failed",
  ]);
});
