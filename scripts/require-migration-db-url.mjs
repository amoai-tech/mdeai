#!/usr/bin/env node
/**
 * Fail before Supabase falls back to the local PostgreSQL Unix socket.
 * Never print a connection string or password.
 */
const value = process.env.SUPABASE_DB_URL;
if (!value) {
  console.error(
    "SUPABASE_DB_URL is unset. Load the ignored database environment file into this process " +
    '(example: node --env-file=/path/to/.env.local "$(command -v npm)" run migration:dry-run:include-all).',
  );
  process.exit(1);
}

try {
  const url = new URL(value);
  if (!["postgres:", "postgresql:"].includes(url.protocol) || !url.hostname || !url.username || !url.pathname) {
    throw new Error("invalid PostgreSQL URL");
  }
} catch {
  console.error("SUPABASE_DB_URL is not a valid PostgreSQL connection URL. Check the ignored environment file.");
  process.exit(1);
}
