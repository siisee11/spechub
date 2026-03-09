import { expect, test } from "bun:test";

import { completionStatus, hasCompletionSignal } from "./lib/completion.mts";

test("completion signal detection works", () => {
  expect(hasCompletionSignal("done <promise>COMPLETE</promise>")).toBe(true);
  expect(completionStatus("still working")).toBe("incomplete");
});
