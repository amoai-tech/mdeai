#!/usr/bin/env bash
set -euo pipefail
cd /workspace
npm ci --no-audit --no-fund
