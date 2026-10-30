#!/usr/bin/env bash
set -euo pipefail
# Canary's cloud sandbox always mounts its source at /workspace; this is its
# documented runtime contract, not an assumption about the developer's checkout.
# Setup executes without env.json values. Never provide real QA, Supabase
# service-role, or production tokens to untrusted PR code in any phase.
cd /workspace
# PR-controlled dependency lifecycle scripts can execute arbitrary code. The
# app's Next.js/Mastra browser smoke works with lifecycle scripts disabled.
npm ci --ignore-scripts --no-audit --no-fund
