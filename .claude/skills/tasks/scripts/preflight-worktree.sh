#!/usr/bin/env bash
# Read-only preflight for creating a new worktree at a target path.
# Usage: preflight-worktree.sh <target-path>
set -euo pipefail
TARGET="${1:-}"
[ -n "$TARGET" ] || { echo "Usage: preflight-worktree.sh <target-path>" >&2; exit 2; }
ROOT=$(git rev-parse --show-toplevel)
cd "$ROOT"

super=$(git rev-parse --show-superproject-working-tree 2>/dev/null || true)
if [ -n "$super" ]; then
  echo "BLOCKED: current repository is a submodule; create the worktree from the owning repository." >&2
  exit 1
fi

git_dir=$(cd "$(git rev-parse --git-dir)" && pwd -P)
git_common=$(cd "$(git rev-parse --git-common-dir)" && pwd -P)
if [ "$git_dir" != "$git_common" ]; then
  echo "BLOCKED: already inside a linked worktree; do not create a nested worktree here." >&2
  exit 1
fi

case "$TARGET" in
  /*|../*) echo "OK: target is outside the repository; no in-repo staging leak." ;;
  *)
    if git check-ignore -q "$TARGET/.mde-ignore-probe" 2>/dev/null; then
      echo "OK: target path is ignored"
    else
      echo "BLOCKED: in-repo target '$TARGET' is not ignored." >&2
      exit 1
    fi
    ;;
esac

if [ -n "$(git status --short)" ]; then
  echo "WARN: current checkout is dirty. Do not discard it; create the new worktree from an explicit durable base such as origin/main or the intended parent branch." >&2
else
  echo "OK: current checkout is clean"
fi

echo "Preflight complete. Resolve and pass the intended base explicitly to 'git worktree add'."
