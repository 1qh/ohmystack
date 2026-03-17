#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"

if ! command -v maestro >/dev/null 2>&1; then
  printf 'maestro CLI not found in PATH\n' >&2
  exit 1
fi

dbs=(convex spacetimedb)
apps=(movie blog chat org)

for db in "${dbs[@]}"; do
  for app in "${apps[@]}"; do
    flow_dir="$ROOT_DIR/apps/mobile/$db/$app/e2e"
    if [ ! -d "$flow_dir" ]; then
      printf 'Skipping missing directory: %s\n' "$flow_dir"
      continue
    fi

    mapfile -t flows < <(ls "$flow_dir"/*.yaml 2>/dev/null || true)
    if [ "${#flows[@]}" -eq 0 ]; then
      printf 'No flows found in %s\n' "$flow_dir"
      continue
    fi

    printf '\n== Running %s/%s (%s flows) ==\n' "$db" "$app" "${#flows[@]}"
    for flow in "${flows[@]}"; do
      maestro test "$flow"
    done
  done
done

printf '\nAll Expo mobile Maestro flows finished.\n'
