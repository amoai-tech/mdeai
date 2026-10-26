/**
 * SAN-1524 · the single source of truth for which remote hosts `next/image` may optimise.
 *
 * Both `next.config.ts` (which must declare the patterns) and components that render a
 * database-supplied URL import from here, so the allowlist can never drift from the check.
 *
 * A URL outside this list is not merely ugly: Next throws "hostname is not configured" and the
 * page fails to render. Public pages therefore ask before rendering, and fall back instead.
 */

export type RemoteImageRule = {
  protocol: "https";
  hostname: string;
  /** Present only for hosts that are safe solely under a prefix (Supabase Storage). */
  pathPrefix?: string;
};

const STATIC_HOSTS: RemoteImageRule[] = [
  { protocol: "https", hostname: "images.unsplash.com" },
  // Apartment seed images (SAN-718 live data).
  { protocol: "https", hostname: "picsum.photos" },
  // Wikimedia Commons: openly licensed photos of real places (tourist_destinations). Restricted to the
  // Commons file tree; every record that points here must carry its author and licence (see
  // fetchLiveDestinations), so a card never shows a Commons picture without credit.
  { protocol: "https", hostname: "upload.wikimedia.org", pathPrefix: "/wikipedia/commons/" },
];

const SUPABASE_STORAGE_PREFIX = "/storage/v1/object/public/";

/** The Supabase project host, derived the same way `next.config.ts` derives it. */
export function supabaseStorageHost(): string | undefined {
  const raw = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!raw) return undefined;
  try {
    return new URL(raw).hostname;
  } catch {
    return undefined;
  }
}

export function remoteImageRules(): RemoteImageRule[] {
  const host = supabaseStorageHost();
  return host
    ? [...STATIC_HOSTS, { protocol: "https", hostname: host, pathPrefix: SUPABASE_STORAGE_PREFIX }]
    : [...STATIC_HOSTS];
}

/** True only for an https URL whose host — and, where required, path — Next is configured for. */
export function isRenderableRemoteImage(url: string | null | undefined): boolean {
  if (!url) return false;
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  if (parsed.protocol !== "https:") return false;
  return remoteImageRules().some(
    (rule) =>
      rule.hostname === parsed.hostname &&
      (!rule.pathPrefix || parsed.pathname.startsWith(rule.pathPrefix)),
  );
}
