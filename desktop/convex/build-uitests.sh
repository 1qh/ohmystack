#!/usr/bin/env bash
set -euo pipefail

for dir in blog chat movie org; do
  printf 'Building UI tests for %s\n' "$dir"
  swift build --package-path "desktop/convex/$dir"
done
