#!/usr/bin/env bash
# Make a fresh git worktree runnable: dependencies and optional local configuration.
#
#   scripts/worktree-bootstrap.sh
#   MDE_WORKTREE_LINK_ENV=1 scripts/worktree-bootstrap.sh  # explicitly link production-backed env
#
# Safe to re-run. node_modules is never shared. Production-backed .env files are not exposed to
# a fresh worktree unless MDE_WORKTREE_LINK_ENV=1 is set (see the worktree guidance).
set -euo pipefail

here=$(git rev-parse --show-toplevel)
worktrees=$(git worktree list --porcelain)
main=$(printf '%s\n' "$worktrees" | sed -n '1s/^worktree //p')
main_is_bare=false
while IFS= read -r line; do
  [ -n "$line" ] || break
  if [ "$line" = "bare" ]; then
    main_is_bare=true
  fi
done <<< "$worktrees"
cd "$here"

if [ "$main_is_bare" = true ]; then
  echo "Bare repository: there is no main checkout to bootstrap from." >&2
  exit 1
fi

if [ "$here" = "$main" ]; then
  echo "This is the main checkout; nothing to bootstrap." >&2
  exit 0
fi

# Match CI and the repository bootstrap contract; do not suppress dependency lifecycle scripts.
npm ci --no-audit --no-fund

if [ "${MDE_WORKTREE_LINK_ENV:-0}" = "1" ]; then
  for f in .env .env.local; do
    if [ -f "$main/$f" ] && [ ! -e "$here/$f" ]; then
      ln -s "$main/$f" "$here/$f"
      echo "linked $f from the main checkout"
    fi
  done
else
  echo "skipped .env/.env.local (set MDE_WORKTREE_LINK_ENV=1 to link production-backed env files)"
fi

# The Codacy CLI config exists only (untracked) in the main checkout. Copy it, and keep it out of
# git status so it can never be staged by accident.
if [ -d "$main/.codacy" ] && [ ! -e "$here/.codacy" ]; then
  cp -r "$main/.codacy" "$here/.codacy"
  exclude="$(git rev-parse --git-common-dir)/info/exclude"
  mkdir -p "$(dirname "$exclude")"
  grep -qxF '/.codacy/' "$exclude" 2>/dev/null || echo '/.codacy/' >> "$exclude"
  echo "copied .codacy (excluded from git status)"
fi

cat <<'EOF'

Ready. Two things that still catch people:
  - Production-backed env files are not linked by default. If you explicitly need them, rerun with
    MDE_WORKTREE_LINK_ENV=1. npm run floor needs NEXT_PUBLIC_GOOGLE_MAPS_API_KEY from the main .env.
  - Tests that use the service-role key write to the one shared Supabase project (production).
EOF
