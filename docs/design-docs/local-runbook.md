# Local Runbook

## Bootstrap

1. `scripts/harness/init.sh --base-branch main --work-branch harness/bootstrap`
2. `make ci`
3. `harness/target/release/harnesscli boot`
4. `harness/target/release/harnesscli observability start`

## Environment Variables

- `DISCODE_WORKTREE_ID` - optional override for the derived worktree ID
- `HARNESS_APP_PORT` - optional override for the preview server port
- `HARNESS_VECTOR_LOG_PORT`
- `HARNESS_VECTOR_OTLP_PORT`
- `HARNESS_VLOGS_PORT`
- `HARNESS_VMETRICS_PORT`
- `HARNESS_VTRACES_PORT`

## Troubleshooting

- If a derived port is already in use, export an override and re-run the command.
- If background services were interrupted, run `harnesscli observability stop --clean` before restarting.
- If `init.sh` has to compile the harness for the first time, expect the first run to be slower than subsequent runs.
