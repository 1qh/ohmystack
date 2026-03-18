#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

ROOT_DIR="$ROOT_DIR" python3 - <<'PY'
from pathlib import Path
import os
import re

root = Path(os.environ["ROOT_DIR"])
patterns = [
    root / "expo/cvx",
    root / "expo/stdb",
]

files: list[Path] = []
for base in patterns:
    if not base.exists():
        continue
    for app in base.iterdir():
        if not app.is_dir():
            continue
        ios = app / "ios"
        if not ios.exists():
            continue
        for candidate in ios.glob("*/AppDelegate.swift"):
            files.append(candidate)

for file in files:
    text = file.read_text()
    updated = text
    updated = re.sub(r"^(final\s+)?class\s+AppDelegate", "public final class AppDelegate", updated, flags=re.MULTILINE)
    updated = re.sub(r"^class\s+AppDelegate", "public final class AppDelegate", updated, flags=re.MULTILINE)
    updated = re.sub(r"^var\s+window:\s*UIWindow\?", "public weak var window: UIWindow?", updated, flags=re.MULTILINE)
    updated = re.sub(r"^\s*var\s+window:\s*UIWindow\?", "  public weak var window: UIWindow?", updated, flags=re.MULTILINE)
    updated = re.sub(r"^extension\s+AppDelegate", "public extension AppDelegate", updated, flags=re.MULTILINE)
    if updated != text:
        file.write_text(updated)
PY
