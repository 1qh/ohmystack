#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
EMULATOR="$HOME/Library/Android/sdk/emulator/emulator"
AVDS=(Maestro_Shard_2)
PORTS=(5556)
REQUIRED_PKGS=(dev.noboil.movie dev.noboil.blog dev.noboil.chat dev.noboil.org)
TIMEOUT_BIN="$(command -v timeout || true)"

run_with_timeout() {
  if [ -n "$TIMEOUT_BIN" ]; then
    "$TIMEOUT_BIN" "$1" "${@:2}"
  else
    "${@:2}"
  fi
}

cleanup() {
  if [ -n "${PROXY_PID:-}" ]; then
    kill "$PROXY_PID" 2>/dev/null || true
  fi
}
trap cleanup EXIT

if ! command -v adb >/dev/null 2>&1; then
  exit 0
fi

if ! command -v maestro >/dev/null 2>&1; then
  exit 0
fi

if [ ! -x "$EMULATOR" ]; then
  exit 0
fi

if ! lsof -i :3210 -sTCP:LISTEN >/dev/null 2>&1; then
  bun "$SCRIPT_DIR/../../../lib/e2e/src/auth-proxy.ts" &
  PROXY_PID=$!
  sleep 1
fi

for i in "${!AVDS[@]}"; do
  port=${PORTS[$i]}
  if ! run_with_timeout 15s adb devices 2>/dev/null | grep -q "emulator-${port}"; then
    "$EMULATOR" -avd "${AVDS[$i]}" -no-window -no-audio -no-boot-anim -port "$port" >/tmp/noboil-maestro-emulator-${port}.log 2>&1 &
  fi
done

for port in "${PORTS[@]}"; do
  started_at="$(date +%s)"
  while true; do
    now="$(date +%s)"
    if [ $((now - started_at)) -ge 300 ]; then
      exit 0
    fi
    boot_value="$(run_with_timeout 10s adb -s "emulator-${port}" shell getprop sys.boot_completed 2>/dev/null | tr -d '\r' || true)"
    if [ "$boot_value" = "1" ]; then
      break
    fi
    sleep 2
  done
done

MISSING_PKG=0
for port in "${PORTS[@]}"; do
  for pkg in "${REQUIRED_PKGS[@]}"; do
    if ! run_with_timeout 15s adb -s "emulator-${port}" shell pm list packages "$pkg" 2>/dev/null | grep -q "$pkg"; then
      MISSING_PKG=1
      break
    fi
  done
done

if [ "$MISSING_PKG" -eq 1 ]; then
  exit 0
fi

MOBILE_DIR="$SCRIPT_DIR/.."

for suite in movie blog chat org; do
  for flow in "$MOBILE_DIR/$suite/e2e/"*.yaml; do
    [ -f "$flow" ] || continue
    maestro test --exclude-tags helper --format NOOP "$flow"
  done
done
