/**
 * SAN-1542 — a restaurant website may only be imported from a public http(s) URL.
 *
 * Provider URL fetching (Gemini URL Context) must never be pointed at localhost,
 * a private network address, or a credentialed URL. This mirrors the SAN-1193
 * onboarding guard so both import paths reject the same targets.
 */
function isPrivateHost(host: string): boolean {
  // URL.hostname keeps brackets for IPv6 literals; only public DNS names and
  // public IPv4 addresses are accepted here.
  if (host.startsWith("[") || host.includes(":")) return true;
  const name = host.toLowerCase().replace(/\.+$/, "");
  if (
    name === "localhost" ||
    name.endsWith(".localhost") ||
    name.endsWith(".local") ||
    name.endsWith(".internal")
  ) {
    return true;
  }
  const match = name.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (!match) return false;
  const a = Number(match[1]);
  const b = Number(match[2]);
  if (a === 10 || a === 127 || a === 0) return true;
  if (a === 169 && b === 254) return true;
  if (a === 192 && b === 168) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 100 && b >= 64 && b <= 127) return true;
  if (a >= 224) return true;
  return false;
}

/** Returns a normalized public URL, or null when it must not be fetched. */
export function normalizePublicRestaurantUrl(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const scheme = trimmed.match(/^([a-z][a-z0-9+.-]*):/i);
  if (scheme && !/^https?$/i.test(scheme[1])) return null;
  const withScheme = /^https?:\/\//i.test(trimmed) ? trimmed : "https://" + trimmed;
  let url: URL;
  try {
    url = new URL(withScheme);
  } catch {
    return null;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return null;
  if (url.username || url.password) return null;
  if (isPrivateHost(url.hostname)) return null;
  if (url.port && url.port !== "80" && url.port !== "443") return null;
  url.hash = "";
  return url.toString();
}
