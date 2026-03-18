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

all_targets=(
  convex/blog
  convex/chat
  convex/movie
  convex/org
  spacetimedb/blog
  spacetimedb/chat
  spacetimedb/movie
  spacetimedb/org
)

get_smoke_flow() {
  case "$1/$2" in
    convex/blog|spacetimedb/blog)
      printf '001-auth-session-persists-across-page-navigation.yaml'
      ;;
    convex/chat|spacetimedb/chat)
      printf '001-chat-shows-empty-state-for-new-chat.yaml'
      ;;
    convex/movie|spacetimedb/movie)
      printf '001-movies-shows-movie-search-page.yaml'
      ;;
    convex/org)
      printf '002-onboarding-back-button-is-not-visible-on-first-step.yaml'
      ;;
    spacetimedb/org)
      printf '001-onboarding-shows-step-1-profile-on-initial-load.yaml'
      ;;
    *)
      return 1
      ;;
  esac
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
  flow_file="$(get_smoke_flow "$db" "$app")"
  flow_path="$ROOT_DIR/apps/mobile/$db/$app/e2e/$flow_file"

  if [ ! -f "$flow_path" ]; then
    printf 'Missing flow: %s\n' "$flow_path" >&2
    exit 1
  fi

  if [ "$DRY_RUN" = true ]; then
    printf 'DRY RUN %s/%s -> %s\n' "$db" "$app" "$flow_file"
    continue
  fi

  printf '\n== %s/%s smoke ==\n' "$db" "$app"
  start_metro "$db" "$app"
  run_maestro "$flow_path"
done <<EOF
$selected_list
EOF

printf '\nImpacted mobile smoke verification finished.\n'
