#!/usr/bin/env bash
# Make a fresh git worktree runnable: dependencies, env files, and the local Codacy config.
#
#   scripts/worktree-bootstrap.sh            # run from inside the new worktree
#
# Safe to re-run. It never copies secrets: .env and .env.local stay in the main checkout and
# are symlinked, so there is one place to rotate them. node_modules is NOT shared; each
# worktree gets its own clean install (see .claude/skills/tasks/references/worktrees.md).
set -euo pipefail

here=$(git rev-parse --show-toplevel)
main=$(git worktree list --porcelain | sed -n '1s/^worktree //p')
cd "$here"

if [ "$here" = "$main" ]; then
  echo "This is the main checkout; nothing to bootstrap." >&2
  exit 0
fi

# --ignore-scripts matches how the floor, typecheck and Playwright were proven in a fresh worktree.
npm ci --no-audit --no-fund --ignore-scripts

for f in .env .env.local; do
  if [ -f "$main/$f" ] && [ ! -e "$here/$f" ]; then
    ln -s "$main/$f" "$here/$f"
    echo "linked $f from the main checkout"
  fi
done

# The Codacy CLI config exists only (untracked) in the main checkout. Copy it, and keep it out of
# `git status` so it can never be staged by accident.
if [ -d "$main/.codacy" ] && [ ! -e "$here/.codacy" ]; then
  cp -r "$main/.codacy" "$here/.codacy"
  exclude="$(git rev-parse --git-common-dir)/info/exclude"
  grep -qxF '/.codacy/' "$exclude" 2>/dev/null || echo '/.codacy/' >> "$exclude"
  echo "copied .codacy (excluded from git status)"
fi

cat <<'EOF'

Ready. Two things that still catch people:
  - `npm run floor` needs NEXT_PUBLIC_GOOGLE_MAPS_API_KEY. It is in the main checkout's .env,
    not .env.local. Export it for the run; never write it into a tracked file.
  - Tests that use the service-role key write to the one shared Supabase project (production).
EOF
