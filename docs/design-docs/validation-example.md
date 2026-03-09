# Validation Example

1. Run `scripts/harness/init.sh --work-branch repro/spec-preview`.
2. Start the preview app with `harnesscli boot`.
3. Start local observability with `harnesscli observability start`.
4. Use the `agent-browser` skill against the `app_url` returned by `harnesscli boot`.
5. Capture a DOM snapshot or screenshot of the preview page.
6. Make a code or docs change.
7. Re-run `make test`, then re-open the same `app_url` and compare the result.
8. Query the local stub APIs if needed:
   - `harnesscli observability query logs '{app="spechub"}'`
   - `harnesscli observability query metrics 'rate(preview_requests_total[1m])'`
   - `harnesscli observability query traces '{duration > 1s}'`
