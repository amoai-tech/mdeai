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
 * before the test opens a connection. An intentional remote run (the VEB-MVP-010 lane
 * uses a dedicated remote test database) must opt in explicitly with
 * `MASTRA_ALLOW_REMOTE_INTEGRATION=1`, so an accidental production URL can never be
 * mistaken for an intentional one.
 */

/** Hosts that can only ever be the local machine. Deliberately narrow. */
const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "::", "::1"]);

export const REMOTE_INTEGRATION_OPT_IN = "MASTRA_ALLOW_REMOTE_INTEGRATION";

/**
 * Throw unless `databaseUrl` points at a loopback host, or the explicit remote opt-in is set.
 *
 * @param databaseUrl - the `DATABASE_URL` the proof would connect to.
 * @param flagName - the env var that enabled this proof, used in the failure message.
 */
export function assertLoopbackDatabaseUrl(
  databaseUrl: string | undefined,
  flagName: string,
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

  // URL keeps IPv6 literals in brackets and a root dot can be present; canonicalize so
  // `[::1]`, `::1` and `localhost.` cannot slip past the allowlist.
  const host = hostname.replace(/^\[|\]$/g, "").replace(/\.$/, "").toLowerCase();
  if (LOOPBACK_HOSTS.has(host)) return;
  if ((process.env[REMOTE_INTEGRATION_OPT_IN] ?? "").trim() === "1") return;

  throw new Error(
    `Refusing to run a destructive integration proof against non-loopback database host "${host}". ` +
      "These proofs create and delete rows. Point DATABASE_URL at a scratch Postgres " +
      `(localhost / 127.0.0.1 / ::1); if this remote database is deliberate, set ${REMOTE_INTEGRATION_OPT_IN}=1.`,
  );
}
