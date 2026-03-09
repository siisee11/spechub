# Worktree Runtime

## Worktree Identity

`harnesscli` derives a stable worktree ID from the repository root path and current Git branch. The result is a short slug plus a deterministic hash suffix.

## Derived Resources

Each worktree gets:

- `.worktree/<id>/logs/`
- `.worktree/<id>/tmp/`
- `.worktree/<id>/run/`
- `.worktree/<id>/observability/`

Ports are derived from the same worktree hash and reserved from fixed ranges:

- app preview: `4100-4199`
- vector/log ingest: `4300-4399`
- vector/otlp ingest: `4400-4499`
- logs query: `4500-4599`
- metrics query: `4600-4699`
- traces query: `4700-4799`

If the preferred derived port is occupied, the harness probes the next slot within the same range and records the fallback in metadata.

## Cleanup

- `harnesscli observability stop` terminates background servers recorded for the current worktree.
- Runtime state can be removed safely after the processes exit.
- Git-tracked source files never depend on `.worktree/`.
