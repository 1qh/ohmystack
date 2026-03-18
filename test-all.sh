#!/usr/bin/env bash
set -euo pipefail

printf 'Running web tests\n'
bun test:web

printf 'Running desktop tests\n'
bun test:desktop

printf 'Running mobile tests\n'
bun test:mobile
