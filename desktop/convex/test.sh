#!/usr/bin/env bash
set -euo pipefail

packages=(
  swift-core
  desktop/convex/shared
  desktop/convex/blog
  desktop/convex/chat
  desktop/convex/movie
  desktop/convex/org
)

for pkg in "${packages[@]}"; do
  printf 'Resolving %s\n' "$pkg"
  swift package resolve --package-path "$pkg"
done

for pkg in "${packages[@]}"; do
  printf 'Testing %s\n' "$pkg"
  swift test --package-path "$pkg"
done

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
"$SCRIPT_DIR/build-uitests.sh"
