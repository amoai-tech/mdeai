#!/usr/bin/env bash
# Run the real MDE UI with local Supabase Auth + Postgres-backed Mastra memory.
# Uses the existing app, storage, and routes; does not write secrets to files.
set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")/.."

if [[ "${VERCEL_ENV:-}" == "production" || "${NODE_ENV:-}" == "production" ]]; then
  echo "dev-local-supabase: refuse to start in a production environment" >&2
  exit 1
fi

# Capture the local CLI output without echoing its credentials.
if ! status="$(npx supabase status -o env 2>/dev/null)"; then
  echo "dev-local-supabase: start the local stack with 'npx supabase start' first" >&2
  exit 1
fi

api_url="" db_url="" anon_key="" service_key=""
while IFS='=' read -r name value; do
  name="${name#export }"
  # Supabase CLI uses KEY="value"; strip surrounding single/double quotes.
  if [[ "${value:-}" == \"*\" || "${value:-}" == \'*\' ]]; then
    value="${value:1:${#value}-2}"
  fi
  case "$name" in
    API_URL) api_url="$value" ;;
    DB_URL) db_url="$value" ;;
    ANON_KEY) anon_key="$value" ;;
    SERVICE_ROLE_KEY) service_key="$value" ;;
  esac
done <<< "$status"
unset status

if [[ -z "$api_url" || -z "$db_url" || -z "$anon_key" || -z "$service_key" ]]; then
  echo "dev-local-supabase: local API, DB, anon or service credentials missing" >&2
  exit 1
fi

# Fail closed before exporting any credentials: MDE's configured local ports.
if ! API_URL="$api_url" DB_URL="$db_url" node - <<'NODE'
const api = new URL(process.env.API_URL);
const db = new URL(process.env.DB_URL);
if (api.protocol !== 'http:' || !['localhost','127.0.0.1'].includes(api.hostname) || api.port !== '54621' ||
    !['postgres:','postgresql:'].includes(db.protocol) ||
    !['localhost','127.0.0.1'].includes(db.hostname) || db.port !== '54622') {
  process.exit(1);
}
NODE
then
  echo "dev-local-supabase: refusing a non-local or wrong-port Supabase target" >&2
  exit 1
fi

export NEXT_PUBLIC_SUPABASE_URL="$api_url" SUPABASE_URL="$api_url"
export NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY="$anon_key" NEXT_PUBLIC_SUPABASE_ANON_KEY="$anon_key"
export SUPABASE_ANON_KEY="$anon_key" SUPABASE_SERVICE_ROLE_KEY="$service_key"
export DATABASE_URL="$db_url" MASTRA_DEV_LIBSQL=0

echo "dev-local-supabase: local API :54621, local Postgres :54622, Mastra Postgres; UI :3002"
exec npm run dev:ui:worktree
