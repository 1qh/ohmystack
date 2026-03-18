#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

apps=(movie blog chat org)
dbs=(cvx stdb)

movie_expected=0
blog_expected=0
chat_expected=0
org_expected=0

while IFS='=' read -r key value; do
  case "$key" in
    movie) movie_expected="$value" ;;
    blog) blog_expected="$value" ;;
    chat) chat_expected="$value" ;;
    org) org_expected="$value" ;;
  esac
done < <(
  ROOT_DIR="$ROOT_DIR" python3 - <<'PY'
import glob
import os
import pathlib
import re

root = pathlib.Path(os.environ['ROOT_DIR']) / 'web' / 'cvx'
apps = ['movie', 'blog', 'chat', 'org']

for app in apps:
    count = 0
    for file_path in sorted(glob.glob(str(root / app / 'e2e' / '*.test.ts'))):
        content = pathlib.Path(file_path).read_text()
        count += len(re.findall(r"\btest\(\s*'[^']+'", content))
    print(f"{app}={count}")
PY
)

status=0
total_expected=0
total_mobile=0

get_expected_count() {
  case "$1" in
    movie) printf '%s' "$movie_expected" ;;
    blog) printf '%s' "$blog_expected" ;;
    chat) printf '%s' "$chat_expected" ;;
    org) printf '%s' "$org_expected" ;;
    *) printf '0' ;;
  esac
}

printf '%-14s %-9s %-10s %-10s\n' 'App' 'Web' 'Per DB' 'Expected'
for app in "${apps[@]}"; do
  web_count="$(get_expected_count "$app")"
  expected_total=$((web_count * 2))
  total_expected=$((total_expected + expected_total))
  printf '%-14s %-9s %-10s %-10s\n' "$app" "$web_count" "$web_count" "$expected_total"
done

printf '\n%-14s %-14s %-12s %-12s\n' 'Target' 'Directory' 'Actual' 'Expected'
for db in "${dbs[@]}"; do
  for app in "${apps[@]}"; do
    flow_dir="$ROOT_DIR/expo/$db/$app/e2e"
    actual_count=0
    if [ -d "$flow_dir" ]; then
      actual_count=$(find "$flow_dir" -maxdepth 1 -type f -name '*.yaml' | wc -l | tr -d ' ')
    fi
    expected_count="$(get_expected_count "$app")"
    total_mobile=$((total_mobile + actual_count))
    printf '%-14s %-14s %-12s %-12s\n' "$db/$app" "$flow_dir" "$actual_count" "$expected_count"
    if [ "$actual_count" -ne "$expected_count" ]; then
      status=1
    fi
  done
done

printf '\nGrand total mobile flows: %s\n' "$total_mobile"
printf 'Grand total expected:     %s\n' "$total_expected"

if [ "$total_mobile" -ne "$total_expected" ]; then
  status=1
fi

if [ "$status" -ne 0 ]; then
  printf '\nCount parity check FAILED.\n' >&2
  exit 1
fi

printf '\nCount parity check PASSED.\n'
