#!/bin/bash
# Start all 8 demo apps with nohup so they survive shell exit.
# Usage: sh script/dev-all.sh
set -e
cd "$(dirname "$0")/.."
ROOT="$PWD"
PORTS=(blog:4100 chat:4101 movie:4102 org:4103)
SPORTS=(blog:4200 chat:4201 movie:4202 org:4203)
pkill -9 -f "bun with-env next dev" 2>/dev/null || true
sleep 2
for entry in "${PORTS[@]}"; do
  name="${entry%%:*}"; port="${entry##*:}"
  cd "$ROOT/web/cvx/$name" && setsid nohup bun with-env next dev --port "$port" > "/tmp/dev-$name.log" 2>&1 < /dev/null &
  disown $! 2>/dev/null || true
done
for entry in "${SPORTS[@]}"; do
  name="${entry%%:*}"; port="${entry##*:}"
  cd "$ROOT/web/stdb/$name" && setsid nohup bun with-env next dev --port "$port" > "/tmp/dev-s$name.log" 2>&1 < /dev/null &
  disown $! 2>/dev/null || true
done
cd "$ROOT/doc" && setsid nohup bun run dev > "/tmp/dev-doc.log" 2>&1 < /dev/null &
  disown $! 2>/dev/null || true
cd "$ROOT"
echo "starting 9 apps..."
for p in 4100 4101 4102 4103 4200 4201 4202 4203 4300; do
  for i in $(seq 1 60); do curl -sf -o /dev/null "http://localhost:$p/" && break; sleep 1; done
done
echo "all apps ready on 4100-4103, 4200-4203"
