import { describe, expect, it } from "vitest";
import { safeNextPath } from "../site-url";

/** The origin a browser resolves a post-sign-in redirect against. */
const ORIGIN = "https://www.mdeai.co";

describe("safeNextPath", () => {
  it("keeps a site-relative path, query and fragment unchanged", () => {
    const value =
      "/restaurants/ade2d416-1250-4edb-b131-59691910e8e1?contest_id=d1520000-0000-0000-0000-000000000331";
    expect(safeNextPath(value)).toBe(value);
    expect(new URL(safeNextPath(value), ORIGIN).origin).toBe(ORIGIN);
  });

  it("keeps the root path", () => {
    expect(safeNextPath("/")).toBe("/");
  });

  it("falls back when the value is missing or empty", () => {
    expect(safeNextPath(undefined)).toBe("/");
    expect(safeNextPath(null)).toBe("/");
    expect(safeNextPath("")).toBe("/");
  });

  it("uses the caller's fallback", () => {
    expect(safeNextPath(null, "/chat")).toBe("/chat");
    expect(safeNextPath("https://evil.com", "/chat")).toBe("/chat");
  });

  it("does not throw when a repeated query parameter arrives as an array", () => {
    // `/login?next=a&next=b` gives Next.js an array, not a string. The old
    // implementation called `.startsWith` on it and threw inside the auth route.
    expect(safeNextPath(["https://evil.com", "/chat"] as unknown as string)).toBe("/");
  });

  it("rejects the backslash form that a browser turns into another origin", () => {
    // This is the whole bug: a browser treats "\" as "/" for special schemes, so
    // `/\evil.com` is resolved against the current origin as `//evil.com`.
    expect(new URL("/\\evil.com", ORIGIN).origin).toBe("https://evil.com");
    expect(safeNextPath("/\\evil.com")).toBe("/");
  });

  const rejected: Array<[string, string]> = [
    ["protocol-relative", "//evil.com"],
    ["triple slash", "///evil.com"],
    ["backslash authority", "/\\evil.com"],
    ["backslash slash authority", "/\\/evil.com"],
    ["absolute https", "https://evil.com"],
    ["absolute http", "http://evil.com"],
    ["javascript scheme", "javascript:alert(1)"],
    ["mailto scheme", "mailto:someone@evil.com"],
    ["tab before slash", "/\t/evil.com"],
    ["newline before slash", "/\n/evil.com"],
    ["carriage return", "/\r/evil.com"],
    ["null byte", "/\u0000evil.com"],
    ["leading space", " //evil.com"],
    ["no leading slash", "..//evil.com"],
  ];

  it.each(rejected)("rejects %s (%j)", (_label, value) => {
    expect(safeNextPath(value)).toBe("/");
  });

  const accepted = [
    "/",
    "/chat",
    "/restaurants/ade2d416-1250-4edb-b131-59691910e8e1",
    "/restaurants/x?contest_id=abc",
    "/search?q=a%20b",
    "/a/b/c#frag",
  ];

  it.each(accepted)("keeps %j on this site", (value) => {
    const result = safeNextPath(value);
    expect(result).toBe(value);
    expect(new URL(result, ORIGIN).origin).toBe(ORIGIN);
  });
});
