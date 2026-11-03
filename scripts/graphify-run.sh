#!/usr/bin/env bash
# Canonical MDE Graphify wrapper. Runs the official graphifyy CLI from the repo
# root using GRAPHIFY_BIN, PATH, or a legacy project venv. This wrapper — NOT a
# Python script — is the documented entrypoint; older docs referencing
# scripts/graphify-phase2-build.py are stale (that file never existed).
#
# Common commands (all AST-only, $0, no LLM):
#   bash scripts/graphify-run.sh update .      # refresh the graph after code/doc changes
#   bash scripts/graphify-run.sh tree          # regenerate the HTML viz (GRAPH_TREE.html)
#   bash scripts/graphify-run.sh query "..."   # BFS lookup over graph.json
#   bash scripts/graphify-run.sh explain "X"   # plain-language node + neighbors
# Exclusions live in .graphifyignore. Output (graphify-out/) is gitignored.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"

# Graphify 0.9+ can refresh agent skills on CLI invocation; never mutate an
# unrelated Claude/Kilo/Devin configuration during a repository query.
export GRAPHIFY_NO_AUTO_REFRESH="${GRAPHIFY_NO_AUTO_REFRESH:-1}"

if [[ -n "${GRAPHIFY_BIN:-}" ]]; then
  GRAPHIFY="$GRAPHIFY_BIN"
elif command -v graphify >/dev/null 2>&1; then
  GRAPHIFY="$(command -v graphify)"
else
  GRAPHIFY="$HOME/.venvs/graphify/bin/graphify"
fi

if [[ ! -x "$GRAPHIFY" ]]; then
  echo "Graphify executable not found: $GRAPHIFY" >&2
  echo "Install: uv tool install --reinstall --force 'graphifyy[sql]==0.9.101'" >&2
  exit 1
fi

cd "$ROOT"
exec "$GRAPHIFY" "$@"
