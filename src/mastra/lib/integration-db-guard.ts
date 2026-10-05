/**
 * SAN-1311 — fail-closed guard for the destructive/gated Postgres proofs.
 *
 * These integration tests create threads, messages and workflow snapshots in whatever
 * database `DATABASE_URL` names. A developer who exports a production connection string
 * while debugging would therefore write test rows into production. The repo-wide
 * `scripts/warn-remote-database-url.mjs` deliberately only *warns* (and stays silent in
 * CI), which is the wrong posture for a proof that mutates data.
 *
 * This guard is the opposite: it refuses anything that is not a local loopback host,
 * before the test opens a connection. `::` is the IPv6 *unspecified* address ("all
 * interfaces"), NOT loopback, so it is excluded — only `::1` is loopback.
 *
 * A deliberately-remote proof (the VEB-MVP-010 durability lane) must name the **exact**
 * remote host it targets via `MASTRA_ALLOW_REMOTE_DB_HOST`. A bare boolean opt-in would
 * let any remote database — including production — through, so there is no boolean.
 */
import loopbackHosts from "./integration-loopback-hosts.json";

/**
 * Hosts that can only ever be the local machine. This JSON file is the single source of
 * truth, shared with `scripts/drop-optional-mastra-tables.mjs`, so the two enforcement
 * paths cannot drift.
 */
const LOOPBACK_HOSTS = new Set<string>(loopbackHosts);

/** Env var naming the ONE remote host a deliberately-remote proof may target. */
export const REMOTE_DB_HOST_PIN = "MASTRA_ALLOW_REMOTE_DB_HOST";

export type LoopbackGuardOptions = {
  /**
   * Name of an env var holding the exact remote host this proof may target. Passing it opts
   * the caller into a remote run, but only for that exact host. Omit it for a proof that
   * must stay local (the table-drop script has no remote path at all).
   */
  allowRemoteHostEnv?: string;
};

/** Canonicalize a hostname so `[::1]`, `::1`, `Localhost` and `db.example.` compare cleanly. */
function canonicalizeHost(raw: string | undefined): string {
  return String(raw ?? "")
    .trim()
    .replace(/^\[|\]$/g, "")
    .replace(/\.$/, "")
    .toLowerCase();
}

/**
 * Throw unless `databaseUrl` points at a loopback host, or the exact pinned remote host.
 *
 * @param databaseUrl - the `DATABASE_URL` the proof would connect to.
 * @param flagName - the env var that enabled this proof, used in the failure message.
 * @param options - set `allowRemoteHostEnv` to permit one named remote host.
 */
export function assertLoopbackDatabaseUrl(
  databaseUrl: string | undefined,
  flagName: string,
  options: LoopbackGuardOptions = {},
): void {
  const normalized = String(databaseUrl ?? "")
    .trim()
    .replace(/^"|"$/g, "")
    .trim();
  if (!normalized) {
    throw new Error(
      `${flagName} is set but DATABASE_URL is missing; refusing to run a destructive proof without a database.`,
    );
  }

  let hostname: string;
  try {
    hostname = new URL(normalized).hostname;
  } catch {
    throw new Error(
      "Refusing to run a destructive integration proof: DATABASE_URL is not a parseable connection string.",
    );
  }

  const host = canonicalizeHost(hostname);
  if (LOOPBACK_HOSTS.has(host)) return;

  const pinName = options.allowRemoteHostEnv;
  if (pinName) {
    const pinned = canonicalizeHost(process.env[pinName]);
    if (pinned && pinned === host) return;
    if (pinned) {
      throw new Error(
        `Refusing to run a destructive integration proof against database host "${host}": ` +
          `it does not match the pinned ${pinName} "${pinned}".`,
      );
    }
  }

  throw new Error(
    `Refusing to run a destructive integration proof against non-loopback database host "${host}". ` +
      "These proofs create and delete rows. Point DATABASE_URL at a scratch Postgres " +
      "(localhost / 127.0.0.1 / ::1)." +
      (pinName ? ` If this remote database is deliberate, set ${pinName} to its exact host.` : ""),
  );
}
