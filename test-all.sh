#!/usr/bin/env bash
set -euo pipefail

printf 'Running web tests\n'
bun test:web
