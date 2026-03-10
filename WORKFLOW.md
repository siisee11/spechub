---
tracker:
  kind: linear
  api_key: $LINEAR_API_KEY
  project_slug: spechub-a57cd115cb0f
  active_states:
    - Todo
    - In Progress
  terminal_states:
    - Done
    - Closed
    - Cancelled
    - Canceled
    - Duplicate

polling:
  interval_ms: 30000

workspace:
  root: .worktree/symphony-workspaces

hooks:
  timeout_ms: 60000

agent:
  max_concurrent_agents: 2
  max_turns: 20
  max_retry_backoff_ms: 300000

codex:
  command: codex app-server
  approval_policy: never
  thread_sandbox: workspace-write
  turn_sandbox_policy: workspace-write
  turn_timeout_ms: 3600000
  read_timeout_ms: 5000
  stall_timeout_ms: 300000

linear:
  dispatch:
    assignee: viewer
    state: In Progress
    comment: |
      Symphony started processing {{ issue.identifier }}.
      Attempt: {{ attempt }}
  completion:
    comment: |
      Symphony finished processing {{ issue.identifier }}.
      PR: {{ result.pr_url }}
  failure:
    comment: |
      Symphony failed while processing {{ issue.identifier }}.
      Error: {{ error }}
---
You are working a Linear issue in an automated Symphony + Ralph loop.

Issue: {{ issue.identifier }} - {{ issue.title }}
State: {{ issue.state }}
Priority: {{ issue.priority }}
Attempt: {{ attempt }}

Description:
{{ issue.description }}

Labels:
{% for label in issue.labels %}- {{ label }}
{% endfor %}

Blocked by:
{% for blocker in issue.blocked_by %}- {{ blocker.identifier }} ({{ blocker.state }})
{% endfor %}

Requirements:
- Work only inside the assigned issue workspace.
- Follow repository guardrails in AGENTS.md, ARCHITECTURE.md, and NON_NEGOTIABLE_RULES.md.
- Update tests for every code change.
- If the issue is fully complete, finish cleanly and hand off through the normal Ralph loop flow.
