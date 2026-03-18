#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"

if ! command -v maestro >/dev/null 2>&1; then
  printf 'maestro CLI not found in PATH\n' >&2
  exit 1
fi

BASE_REF=""
DEVICE_ID="${MAESTRO_DEVICE:-}"
DRY_RUN=false
FORCE_ALL=false

targets=()

while [ "$#" -gt 0 ]; do
  case "$1" in
    --base)
      BASE_REF="${2:-}"
      shift 2
      ;;
    --device)
      DEVICE_ID="${2:-}"
      shift 2
      ;;
    --dry-run)
      DRY_RUN=true
      shift
      ;;
    --all)
      FORCE_ALL=true
      shift
      ;;
    --target)
      targets+=("${2:-}")
      shift 2
      ;;
    *)
      printf 'Unknown arg: %s\n' "$1" >&2
      exit 1
      ;;
  esac
done

all_targets=()
while IFS= read -r dir; do
  [ -z "$dir" ] && continue
  rel="${dir#$ROOT_DIR/apps/mobile/}"
  db="${rel%%/*}"
  app="${rel##*/}"
  all_targets+=("$db/$app")
done < <(for d in "$ROOT_DIR"/apps/mobile/*/*; do [ -d "$d/e2e" ] && printf '%s\n' "$d"; done)

get_smoke_flow() {
  e2e_dir="$ROOT_DIR/apps/mobile/$1/$2/e2e"
  best_flow=''
  fallback_flow=''

  while IFS= read -r flow; do
    [ -z "$flow" ] && continue
    if [ -z "$fallback_flow" ]; then
      fallback_flow="$flow"
    fi
    app_id="$(python3 - <<PY
from pathlib import Path
p = Path('$flow')
for line in p.read_text().splitlines():
    if line.startswith('appId:'):
        print(line.split(':', 1)[1].strip())
        break
PY
)"
    case "$app_id" in
      *.mobile.*) ;;
      *) best_flow="$flow"; break ;;
    esac
  done < <(for f in "$e2e_dir"/001-*.yaml "$e2e_dir"/*.yaml; do [ -f "$f" ] && printf '%s\n' "$f"; done)

  if [ -n "$best_flow" ]; then
    printf '%s' "${best_flow##*/}"
    return 0
  fi
  [ -n "$fallback_flow" ] || return 1
  printf '%s' "${fallback_flow##*/}"
}

selected_list=''
selected_csv=','

has_target() {
  needle="$1/$2"
  case "$selected_csv" in
    *",$needle,"*) return 0 ;;
  esac
  return 1
}

add_target() {
  if ! has_target "$1" "$2"; then
    selected_csv="$selected_csv$1/$2,"
    selected_list="$selected_list
$1/$2"
  fi
}

add_db_group() {
  for app in blog chat movie org; do
    add_target "$1" "$app"
  done
}

if [ "${#targets[@]}" -gt 0 ]; then
  for t in "${targets[@]}"; do
    db="${t%%/*}"
    app="${t##*/}"
    add_target "$db" "$app"
  done
elif [ "$FORCE_ALL" = true ]; then
  for t in "${all_targets[@]}"; do
    db="${t%%/*}"
    app="${t##*/}"
    add_target "$db" "$app"
  done
else
  changed_files=()
  if [ -n "$BASE_REF" ]; then
    while IFS= read -r p; do
      [ -n "$p" ] && changed_files+=("$p")
    done < <(git diff --name-only "$BASE_REF"...HEAD)
  else
    while IFS= read -r line; do
      p="${line:3}"
      [ -n "$p" ] && changed_files+=("$p")
    done < <(git status --porcelain)
  fi

  if [ "${#changed_files[@]}" -eq 0 ]; then
    for t in "${all_targets[@]}"; do
      db="${t%%/*}"
      app="${t##*/}"
      add_target "$db" "$app"
    done
  else
    for p in "${changed_files[@]}"; do
      case "$p" in
        apps/mobile/convex/blog/*) add_target convex blog ;;
        apps/mobile/convex/chat/*) add_target convex chat ;;
        apps/mobile/convex/movie/*) add_target convex movie ;;
        apps/mobile/convex/org/*) add_target convex org ;;
        apps/mobile/spacetimedb/blog/*) add_target spacetimedb blog ;;
        apps/mobile/spacetimedb/chat/*) add_target spacetimedb chat ;;
        apps/mobile/spacetimedb/movie/*) add_target spacetimedb movie ;;
        apps/mobile/spacetimedb/org/*) add_target spacetimedb org ;;
        apps/mobile/maestro/*) for t in "${all_targets[@]}"; do add_target "${t%%/*}" "${t##*/}"; done ;;
        packages/fe-mobile/*|packages/be-convex/*|packages/be-spacetimedb/*|packages/convex/*|packages/spacetimedb/*|packages/shared/*)
          for t in "${all_targets[@]}"; do add_target "${t%%/*}" "${t##*/}"; done
          ;;
        apps/mobile/convex/*) add_db_group convex ;;
        apps/mobile/spacetimedb/*) add_db_group spacetimedb ;;
      esac
    done
  fi
fi

if [ -z "$selected_list" ]; then
  printf 'No impacted mobile targets detected.\n'
  exit 0
fi

run_maestro() {
  if [ -n "$DEVICE_ID" ]; then
    maestro test --device "$DEVICE_ID" "$1"
  else
    maestro test "$1"
  fi
}

get_bundle_id() {
  app_json="$ROOT_DIR/apps/mobile/$1/$2/app.json"
  python3 - <<PY
import json
from pathlib import Path
p = Path('$app_json')
if not p.exists():
    raise SystemExit(1)
data = json.loads(p.read_text())
print(data['expo']['ios']['bundleIdentifier'])
PY
}

materialize_flow() {
  source_flow="$1"
  bundle_id="$2"
  target_flow="/tmp/noboil-fast-$(basename "$source_flow")"
  SOURCE_FLOW="$source_flow" TARGET_FLOW="$target_flow" BUNDLE_ID="$bundle_id" python3 - <<'PY'
from pathlib import Path
import os

source = Path(os.environ['SOURCE_FLOW'])
target = Path(os.environ['TARGET_FLOW'])
bundle_id = os.environ['BUNDLE_ID']

lines = source.read_text().splitlines()
updated = []
replaced = False
for line in lines:
    if not replaced and line.startswith('appId:'):
        updated.append(f'appId: {bundle_id}')
        replaced = True
    else:
        updated.append(line)
target.write_text('\n'.join(updated) + '\n')
PY
  printf '%s' "$target_flow"
}

start_metro() {
  pid="$(lsof -tiTCP:8081 -sTCP:LISTEN || true)"
  if [ -n "$pid" ]; then
    kill -9 "$pid"
  fi
  app_dir="$ROOT_DIR/apps/mobile/$1/$2"
  log_file="/tmp/noboil-$1-$2-metro.log"
  (cd "$app_dir" && nohup bun with-env expo start -c >"$log_file" 2>&1 &)
  sleep "${METRO_WAIT_SECONDS:-10}"
  lsof -nP -iTCP:8081 -sTCP:LISTEN >/dev/null
}

while IFS= read -r key; do
  [ -z "$key" ] && continue
  db="${key%%/*}"
  app="${key##*/}"
  bundle_id="$(get_bundle_id "$db" "$app")"
  flow_file="$(get_smoke_flow "$db" "$app")"
  flow_path="$ROOT_DIR/apps/mobile/$db/$app/e2e/$flow_file"

  if [ ! -f "$flow_path" ]; then
    printf 'Missing flow: %s\n' "$flow_path" >&2
    exit 1
  fi

  if [ "$DRY_RUN" = true ]; then
    printf 'DRY RUN %s/%s -> %s (%s)\n' "$db" "$app" "$flow_file" "$bundle_id"
    continue
  fi

  printf '\n== %s/%s smoke ==\n' "$db" "$app"
  start_metro "$db" "$app"
  temp_flow="$(materialize_flow "$flow_path" "$bundle_id")"
  run_maestro "$temp_flow"
done <<EOF
$selected_list
EOF

printf '\nImpacted mobile smoke verification finished.\n'
