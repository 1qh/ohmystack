#!/usr/bin/env bash
set -euo pipefail

PIDS=()

for dir in blog chat movie org; do
  swift build --package-path "desktop/convex/$dir" &
  PIDS+=($!)
done

FAIL=0
for pid in "${PIDS[@]}"; do
  wait "$pid" || FAIL=1
done
exit $FAIL
