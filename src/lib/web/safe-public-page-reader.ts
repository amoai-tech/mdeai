import { guardedFetch, isGuardedFetchError, readBodyAsText } from "guarded-fetch";
import { Parser } from "htmlparser2";

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

/** Linear-time event-based HTML parsing, never regex over attacker-controlled markup. */
function readablePage(html: string): { title?: string; text: string } {
  const ignored = new Set(["script", "style", "svg", "noscript", "template", "head", "nav", "footer"]);
  const breaks = new Set(["p", "div", "li", "br", "h1", "h2", "h3", "h4", "h5", "h6", "section", "article"]);
  const chunks: string[] = [];
  let skipped = 0;
  const ignoredStack: boolean[] = [];
  let count = 0;
  let title = "";
  let inTitle = false;
  const parser = new Parser({
    onopentag(name, attributes) {
      if (name === "title") inTitle = true;
      const ignoreElement = ignored.has(name) || skipped > 0 || attributes.hidden !== undefined ||
        attributes["aria-hidden"] === "true";
      ignoredStack.push(ignoreElement);
      if (ignoreElement) skipped++;
      if (!skipped && breaks.has(name) && count < 22_000) {
        chunks.push("\n");
        count++;
      }
    },
    ontext(text) {
      if (inTitle) title += text.slice(0, Math.max(0, 250 - title.length));
      if (skipped || count >= 22_000) return;
      const limited = text.slice(0, 22_000 - count);
      chunks.push(limited);
      count += limited.length;
    },
    onclosetag(name) {
      if (name === "title") inTitle = false;
      if (ignoredStack.pop()) skipped--;
      else if (!skipped && breaks.has(name) && count < 22_000) {
        chunks.push("\n");
        count++;
      }
    },
  }, { decodeEntities: true });
  parser.write(html);
  parser.end();
  return {
    title: title.trim().slice(0, 250) || undefined,
    text: chunks.join("").replace(/[\t\r ]+/g, " ").replace(/\n\s*\n+/g, "\n").trim(),
  };
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
