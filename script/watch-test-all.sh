#!/usr/bin/env bash
set -euo pipefail

INTERVAL_SECONDS="${WATCH_INTERVAL_SECONDS:-20}"
STALL_SECONDS="${WATCH_STALL_SECONDS:-300}"
LOG_FILE="${WATCH_LOG_FILE:-/tmp/noboil-test-all.log}"
CMD="${WATCH_COMMAND:-bun test:all}"

rm -f "$LOG_FILE"

printf 'Starting watched command: %s\n' "$CMD"
printf 'Log file: %s\n' "$LOG_FILE"
printf 'Interval: %ss, stall timeout: %ss\n' "$INTERVAL_SECONDS" "$STALL_SECONDS"

bash -lc "$CMD" >"$LOG_FILE" 2>&1 &
RUN_PID=$!

last_size=0
last_change_at="$(date +%s)"

cleanup() {
  if kill -0 "$RUN_PID" >/dev/null 2>&1; then
    kill "$RUN_PID" >/dev/null 2>&1 || true
  fi
}
trap cleanup INT TERM

while kill -0 "$RUN_PID" >/dev/null 2>&1; do
  sleep "$INTERVAL_SECONDS"

  current_size="$(wc -c < "$LOG_FILE" | tr -d '[:space:]')"
  now="$(date +%s)"

  if [ "$current_size" -gt "$last_size" ]; then
    last_size="$current_size"
    last_change_at="$now"

    last_line="$(grep -v '^[[:space:]]*$' "$LOG_FILE" | tail -n 1 || true)"
    [ -z "$last_line" ] && last_line='<no non-empty output yet>'
    printf '[watch] progress bytes=%s line=%s\n' "$current_size" "$last_line"
    continue
  fi

  stalled_for=$((now - last_change_at))
  printf '[watch] no new output for %ss\n' "$stalled_for"

  if [ "$stalled_for" -ge "$STALL_SECONDS" ]; then
    printf '[watch] stalled for %ss, terminating command\n' "$stalled_for"
    kill "$RUN_PID" >/dev/null 2>&1 || true
    wait "$RUN_PID" >/dev/null 2>&1 || true
    printf '[watch] tail of log (%s):\n' "$LOG_FILE"
    tail -n 60 "$LOG_FILE" || true
    exit 1
  fi
done

wait "$RUN_PID"
status=$?

printf '[watch] command exited with status %s\n' "$status"
if [ "$status" -ne 0 ]; then
  printf '[watch] tail of log (%s):\n' "$LOG_FILE"
  tail -n 60 "$LOG_FILE" || true
fi

exit "$status"
