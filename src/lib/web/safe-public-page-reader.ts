import { guardedFetch, isGuardedFetchError, readBodyAsText } from "guarded-fetch";

/** One server-only HTTP boundary shared by Partner and Restaurant website imports. */
export type PublicWebsitePage = {
  requestedUrl: string;
  finalUrl: string;
  title?: string;
  text: string;
  retrievedAt: string;
};

export class PublicWebsiteReadError extends Error {
  constructor(readonly code: "unsafe_url" | "timeout" | "unavailable" | "unusable_page") {
    super("Could not read that public website. Try again or enter the details manually.");
    this.name = "PublicWebsiteReadError";
  }
}

const MAX_HTML_BYTES = 512 * 1024;
const FETCH_TIMEOUT_MS = 7_000;

function decodeEntities(text: string): string {
  const named: Record<string, string> = {
    amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ",
    rsquo: "’", lsquo: "‘", ldquo: "“", rdquo: "”", ndash: "–", mdash: "—",
    copy: "©", hellip: "…",
  };
  return text.replace(/&(#x[\da-f]+|#\d+|[a-z]+);/gi, (match, entity: string) => {
    const code = entity.toLowerCase();
    const point = code.startsWith("#x") ? Number.parseInt(code.slice(2), 16)
      : code.startsWith("#") ? Number.parseInt(code.slice(1), 10) : null;
    if (point !== null) {
      return Number.isInteger(point) && point > 0 && point <= 0x10ffff
        ? String.fromCodePoint(point) : " ";
    }
    return named[code] ?? match;
  });
}

function readablePage(html: string): { title?: string; text: string } {
  const title = /<title(?:\s[^>]*)?>([\s\S]*?)<\/title\s*>/i.exec(html)?.[1];
  const cleaned = html
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<(script|style|svg|noscript|template|head|nav|footer)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, " ")
    .replace(/<(br|p|div|li|h[1-6]|section|article)\b[^>]*>/gi, "\n")
    .replace(/<[^>]*>/g, " ");
  const text = decodeEntities(cleaned).replace(/[\t\r ]+/g, " ")
    .replace(/\n\s*\n+/g, "\n").trim();
  return { title: title ? decodeEntities(title).trim().slice(0, 250) : undefined, text: text.slice(0, 22_000) };
}

export async function readPublicWebsite(rawUrl: string): Promise<PublicWebsitePage> {
  let requestedUrl: string;
  try {
    const parsed = new URL(rawUrl);
    if (!["https:", "http:"].includes(parsed.protocol) || parsed.username || parsed.password ||
        !["", "80", "443"].includes(parsed.port)) throw new Error("unsafe URL");
    requestedUrl = parsed.toString();
  } catch {
    throw new PublicWebsiteReadError("unsafe_url");
  }

  try {
    const deadlineAt = Date.now() + FETCH_TIMEOUT_MS;
    // Validates DNS and actual socket destination on every redirect hop.
    const response = await guardedFetch(requestedUrl, {
      timeoutMs: FETCH_TIMEOUT_MS,
      maxRedirects: 3,
      opaqueErrors: true,
      headers: { Accept: "text/html" },
    });
    if (!response.ok || !/\btext\/html\b/i.test(response.headers.get("content-type") ?? "")) {
      await response.body?.cancel().catch(() => undefined);
      throw new PublicWebsiteReadError("unusable_page");
    }
    const html = await readBodyAsText(response, {
      maxResponseBytes: MAX_HTML_BYTES, deadlineAt, opaqueErrors: true,
    });
    const { title, text } = readablePage(html);
    if (text.length < 40) throw new PublicWebsiteReadError("unusable_page");
    return { requestedUrl, finalUrl: response.url, title, text, retrievedAt: new Date().toISOString() };
  } catch (error) {
    if (error instanceof PublicWebsiteReadError) throw error;
    if (isGuardedFetchError(error)) {
      if (error.code === "timeout") throw new PublicWebsiteReadError("timeout");
      if (["hostname_unsafe", "redirect_to_unsafe_host", "protocol_not_allowed",
        "host_not_allowed", "invalid_url", "redirect_invalid"].includes(error.code))
        throw new PublicWebsiteReadError("unsafe_url");
    }
    throw new PublicWebsiteReadError("unavailable");
  }
}
