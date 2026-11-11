#!/usr/bin/env bash
# Verify the project-local .worktrees/ area cannot be staged accidentally.
set -euo pipefail
ROOT="${1:-$(git rev-parse --show-toplevel 2>/dev/null || pwd)}"
cd "$ROOT"
# git check-ignore evaluates ignore rules even when the probe path does not exist.
probe=".worktrees/__ignore_check__"
if git check-ignore -q "$probe" 2>/dev/null; then
  echo "OK: .worktrees/ is ignored"
  exit 0
fi
echo "BLOCKED: .worktrees/ is not ignored. Add '/.worktrees/' to $ROOT/.gitignore before using an in-repo worktree." >&2
exit 1
