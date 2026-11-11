#!/usr/bin/env bash
# Canonical MDE Graphify wrapper. Prefer the verified isolated uv tool; never
# execute an arbitrary graphify binary from PATH. GRAPHIFY_BIN is an explicit
# caller override, resolved before switching to the repository root.
# Exclusions live in .graphifyignore; generated output is gitignored.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
export GRAPHIFY_NO_AUTO_REFRESH="${GRAPHIFY_NO_AUTO_REFRESH:-1}"
EXPECTED_VERSION="graphify 0.9.101"
INSTALL_CMD="uv tool install --reinstall --force 'graphifyy[sql]==0.9.101'"

if [[ -n "${GRAPHIFY_BIN:-}" ]]; then
  GRAPHIFY="$GRAPHIFY_BIN"
  if [[ "$GRAPHIFY" != /* ]]; then
    GRAPHIFY="$(pwd -P)/$GRAPHIFY"
  fi
elif [[ -x "${UV_TOOL_DIR:-$HOME/.local/share/uv/tools}/graphifyy/bin/graphify" ]]; then
  GRAPHIFY="${UV_TOOL_DIR:-$HOME/.local/share/uv/tools}/graphifyy/bin/graphify"
elif [[ -x "$HOME/.local/bin/graphify" ]]; then
  GRAPHIFY="$HOME/.local/bin/graphify"
else
  GRAPHIFY="$HOME/.venvs/graphify/bin/graphify"
fi

if [[ ! -x "$GRAPHIFY" ]]; then
  echo "Graphify executable not found: $GRAPHIFY" >&2
  echo "Install: $INSTALL_CMD" >&2
  exit 1
fi

# Explicit binary paths are operator-controlled; even these must match our
# tested CLI contract. The version check itself also disables auto-refresh.
# Compare stdout only: other tools' stale global skill copies make Graphify print
# "skill is from graphify X" warnings on stderr, which must not read as a version.
# Any other stderr text is kept and shown if the probe fails.
VERSION_ERR_FILE="$(mktemp)"
VERSION_STATUS=0
VERSION="$("$GRAPHIFY" --version 2>"$VERSION_ERR_FILE")" || VERSION_STATUS=$?
VERSION_DIAG="$(grep -v 'skill is from graphify' "$VERSION_ERR_FILE" || true)"
rm -f "$VERSION_ERR_FILE"
if [[ "$VERSION_STATUS" -ne 0 || "$VERSION" != "$EXPECTED_VERSION" ]]; then
  echo "Incompatible Graphify at $GRAPHIFY (expected $EXPECTED_VERSION; got ${VERSION:-none})." >&2
  if [[ -n "$VERSION_DIAG" ]]; then
    echo "$VERSION_DIAG" >&2
  fi
  echo "Repair: $INSTALL_CMD" >&2
  exit 1
fi

# The SQL grammar is an optional extra. Do not silently build incomplete SQL
# graphs when the required parser is absent from this Graphify environment.
if [[ "${1:-}" = "update" || "${1:-}" = "extract" ]]; then
  RESOLVED_BIN="$(readlink -f "$GRAPHIFY")"
  TOOL_PYTHON="$(dirname "$RESOLVED_BIN")/python"
  if [[ ! -x "$TOOL_PYTHON" ]] || ! "$TOOL_PYTHON" -c 'import tree_sitter_sql' >/dev/null 2>&1; then
    echo "Graphify SQL parser missing from the selected tool environment: $GRAPHIFY" >&2
    echo "Repair: $INSTALL_CMD" >&2
    exit 1
  fi
fi

cd "$ROOT"
exec "$GRAPHIFY" "$@"
