#!/usr/bin/env bash
set -euo pipefail

bun --cwd lib/convex test
bun --cwd lib/spacetimedb test
cd backend/convex && CONVEX_TEST_MODE=true bun with-env bun test convex/f.test.ts convex/org-api.test.ts convex/edge.test.ts
