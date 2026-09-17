/**
 * Resolve the **local** Supabase Postgres URL for mdeai gate scripts.
 *
 * Why this exists: the local stack runs on dedicated mdeai ports (5462x) so it
 * cannot collide with another project's stack on the default 5432x. Gate scripts
 * used to hardcode the full URL, which duplicated `supabase/config.toml` and let
 * the two silently drift apart.
 *
 * Resolution order:
 *   1. `SUPABASE_DB_URL` — explicit override. Use this in CI, or when the stack
 *      was started with non-default ports.
 *   2. `[db] port` in `supabase/config.toml` — the single source of truth, so the
 *      port is never written down twice.
 *
 * The user/password (`postgres`/`postgres`) are the Supabase CLI's public
 * local-stack defaults, bound to 127.0.0.1. They are not secrets and reach
 * nothing beyond the developer's own machine.
 *
 * This module never talks to a remote database. Do not point `SUPABASE_DB_URL`
 * at production from a gate script.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const CONFIG_PATH = join(ROOT, "supabase", "config.toml");

/**
 * Read `[db] port` from supabase/config.toml.
 * Scoped to the exact `[db]` section so `shadow_port` and `[db.pooler] port`
 * cannot be mistaken for it.
 * @returns {number}
 */
export function localDbPort(configPath = CONFIG_PATH) {
  let toml;
  try {
    toml = readFileSync(configPath, "utf8");
  } catch (err) {
    throw new Error(
      `cannot read ${configPath} (${err instanceof Error ? err.message : err})`,
    );
  }

  let inDbSection = false;
  for (const rawLine of toml.split("\n")) {
    const line = rawLine.trim();
    if (line.startsWith("[")) {
      inDbSection = line === "[db]";
      continue;
    }
    if (!inDbSection || line.startsWith("#")) continue;
    const match = /^port\s*=\s*(\d+)\s*$/.exec(line);
    if (match) return Number(match[1]);
  }

  throw new Error(`no [db] port found in ${configPath}`);
}

/**
 * @param {{ database?: string, env?: Record<string, string | undefined> }} [opts]
 * @returns {string} a postgres:// URL for the local stack
 */
export function resolveLocalDbUrl({
  database = "postgres",
  env = process.env,
} = {}) {
  if (env.SUPABASE_DB_URL) return env.SUPABASE_DB_URL;
  return `postgresql://postgres:postgres@127.0.0.1:${localDbPort()}/${database}`;
}
