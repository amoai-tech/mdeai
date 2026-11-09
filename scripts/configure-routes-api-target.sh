#!/usr/bin/env bash
# SAN-465: reproducible Routes API key target without Terraform or key disclosure.
# Usage: scripts/configure-routes-api-target.sh projects/PROJECT/locations/global/keys/KEY_ID [--apply]
# Default checks only; --apply appends Routes without replacing Places/app restrictions.
set -euo pipefail

if [[ $# -lt 1 || $# -gt 2 || ! "${1:-}" =~ ^projects/[^/]+/locations/[^/]+/keys/[^/]+$ ]]; then
  echo "Usage: $0 projects/PROJECT/locations/global/keys/KEY_ID [--apply]" >&2
  exit 2
fi

resource="$1"
mode="${2:---check}"
if [[ "$mode" != "--check" && "$mode" != "--apply" ]]; then
  echo "Only --check and --apply are supported." >&2
  exit 2
fi
command -v gcloud >/dev/null || { echo "gcloud CLI required." >&2; exit 2; }
command -v jq >/dev/null || { echo "jq required." >&2; exit 2; }

check_targets() {
  gcloud services api-keys describe "$resource" --format=json |
    jq -r '.restrictions.apiTargets[]?.service'
}

targets="$(check_targets)"
if printf '%s\n' "$targets" | grep -Fxq 'routes.googleapis.com'; then
  echo "Routes API target present; existing restrictions unchanged."
  exit 0
fi
if [[ -z "$targets" ]]; then
  echo "STOP: key has no API targets. Inspect its existing restrictions before changing it." >&2
  exit 3
fi
if [[ "$mode" == "--check" ]]; then
  echo "Routes API target missing. Run this script with --apply after confirming the intended server key." >&2
  exit 1
fi

# Official gcloud --append preserves existing API targets/referrers/IP restrictions.
gcloud services api-keys update "$resource" \
  --append --api-target=service=routes.googleapis.com --check-existing-usage --quiet >/dev/null
if ! check_targets | grep -Fxq 'routes.googleapis.com'; then
  echo "Routes target could not be verified after update." >&2
  exit 1
fi
echo "Routes API target added and verified. No key value printed."
