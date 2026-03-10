import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";

import { expect, test } from "bun:test";

import { buildSymphonyConfig, validateDispatchConfig } from "./lib/config.mts";
import { renderTemplate, TemplateError } from "./lib/template.mts";
import {
  loadWorkflowDefinition,
  parseWorkflowDefinition,
  resolveWorkflowPath,
  watchWorkflow,
  WorkflowError,
} from "./lib/workflow.mts";

test("workflow loader parses front matter and resolves default path", async () => {
  const definition = await loadWorkflowDefinition({
    cwd: "/repo",
    readFile: async () => `---
tracker:
  kind: linear
  api_key: $LINEAR_API_KEY
  project_slug: app
---
Hello {{ issue.identifier }}`,
  });

  expect(resolveWorkflowPath(undefined, "/repo")).toBe("/repo/WORKFLOW.md");
  expect(definition.path).toBe("/repo/WORKFLOW.md");
  expect(definition.promptTemplate).toContain("issue.identifier");
});

test("workflow loader returns typed errors", () => {
  expect(() => parseWorkflowDefinition("---\n[]\n---\nbody")).toThrow(WorkflowError);
  expect(() => parseWorkflowDefinition("---\ntracker: [\n---\nbody")).toThrow(WorkflowError);
});

test("config builder applies defaults, env indirection, and path normalization", () => {
  const config = buildSymphonyConfig(
    {
      path: "/repo/WORKFLOW.md",
      config: {
        tracker: {
          kind: "linear",
          api_key: "$LINEAR_TOKEN",
          project_slug: "app",
          active_states: "Todo, In Progress",
        },
        workspace: {
          root: "~/workspaces",
        },
        agent: {
          max_concurrent_agents_by_state: {
            " In Progress ": "2",
            Broken: "0",
          },
        },
        linear: {
          dispatch: {
            assignee: "viewer",
            state: "In Progress",
            comment: "Started {{ issue.identifier }}",
          },
          completion: {
            state: "In Review",
            comment: "PR {{ result.pr_url }}",
          },
        },
      },
      promptTemplate: "",
    },
    {
      env: {
        LINEAR_TOKEN: "secret",
      },
      homeDir: "/Users/dev",
      tempDir: "/tmp",
    },
  );

  expect(config.promptTemplate).toBe("You are working on an issue from Linear.");
  expect(config.tracker.apiKey).toBe("secret");
  expect(config.workspace.root).toBe("/Users/dev/workspaces");
  expect(config.agent.maxConcurrentAgentsByState).toEqual({
    "in progress": 2,
  });
  expect(config.linear.dispatch).toEqual({
    assignee: "viewer",
    state: "In Progress",
    comment: "Started {{ issue.identifier }}",
  });
  expect(config.linear.completion).toEqual({
    state: "In Review",
    comment: "PR {{ result.pr_url }}",
  });
  expect(validateDispatchConfig(config)).toEqual([]);
});

test("template renderer is strict and supports loops", () => {
  const output = renderTemplate(
    "Issue {{ issue.identifier }} labels:{% for label in issue.labels %} {{ label }}{% endfor %}",
    {
      issue: {
        identifier: "ABC-1",
        labels: ["bug", "high"],
      },
    },
  );

  expect(output).toBe("Issue ABC-1 labels: bug high");
  expect(() => renderTemplate("{{ issue.missing }}", { issue: {} })).toThrow(TemplateError);
  expect(() => renderTemplate("{{ issue.identifier | upcase }}", { issue: { identifier: "x" } })).toThrow(
    TemplateError,
  );
});

test("workflow watcher emits change events", async () => {
  const dir = await mkdtemp(`${tmpdir()}/symphony-watch-`);
  const workflowPath = `${dir}/WORKFLOW.md`;
  await Bun.write(workflowPath, "first");

  const changed = new Promise<void>((resolve) => {
    const watcher = watchWorkflow(workflowPath, () => {
      watcher.close();
      resolve();
    });
  });
  await Bun.write(workflowPath, "second");
  await changed;
});
