#!/usr/bin/env bash
set -euo pipefail
docker compose -f convex.yml exec backend ./generate_admin_key.sh
