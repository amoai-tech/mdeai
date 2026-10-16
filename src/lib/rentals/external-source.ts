/**
 * SAN-1502 — the single allowlist of external advertisers MDE may link to.
 *
 * External ads are read-only on MDE, and "View original listing" sends a renter off-site.
 * A blocklist of MDE's own hosts is not enough: every other HTTPS URL would be accepted, so a
 * malformed or malicious record could redirect a renter to a phishing page through MDE's UI.
 * Only the advertiser portals MDE actually sources inventory from may be linked; adding a new
 * source is a deliberate code change, not a data change.
 */
export const APPROVED_EXTERNAL_SOURCE_HOSTS = [
  "fincaraiz.com.co",
  "rentberry.com",
  "zitios.com.co",
  "mercadolibre.com.co",
  "ciencuadras.com",
] as const;

/**
 * The URL when it is HTTPS and its host is an approved advertiser, otherwise `null`.
 * `www.` is ignored and a subdomain of an approved host is allowed; a look-alike such as
 * `fincaraiz.com.co.evil.example.com` is not.
 */
export function approvedExternalSourceUrl(value: string | null | undefined): string | null {
  if (!value) return null;
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  if (url.protocol !== "https:") return null;
  const host = url.hostname.toLowerCase().replace(/^www\./, "");
  const approved = APPROVED_EXTERNAL_SOURCE_HOSTS.some(
    (domain) => host === domain || host.endsWith(`.${domain}`),
  );
  return approved ? url.href : null;
}
