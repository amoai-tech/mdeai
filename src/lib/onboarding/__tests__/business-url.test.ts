import { describe, expect, it } from "vitest";

import { isPublicBusinessUrl, normalizeBusinessUrl } from "../business-url";

describe("business URL safety (SAN-1193)", () => {
  it("normalizes a public https URL and adds a missing scheme", () => {
    expect(normalizeBusinessUrl("https://cafe.example.com/menu#top")).toBe(
      "https://cafe.example.com/menu",
    );
    expect(normalizeBusinessUrl("cafe.example.com")).toBe("https://cafe.example.com/");
  });

  it("rejects non-http protocols", () => {
    expect(normalizeBusinessUrl("ftp://example.com")).toBeNull();
    expect(normalizeBusinessUrl("javascript:alert(1)")).toBeNull();
  });

  it("rejects localhost, private networks and credentials", () => {
    for (const url of [
      "http://localhost:3000",
      "http://127.0.0.1",
      "http://10.0.0.4",
      "http://192.168.1.5",
      "http://172.16.0.9",
      "http://169.254.169.254/latest/meta-data",
      "https://user:pass@example.com",
      "http://service.local",
      "http://localhost./",
      "http://foo.localhost./",
      "http://[::1]/",
      "http://[::ffff:127.0.0.1]/",
      "http://[fd00::1]/",
    ]) {
      expect(normalizeBusinessUrl(url)).toBeNull();
      expect(isPublicBusinessUrl(url)).toBe(false);
    }
  });

  it("accepts a normal public host", () => {
    expect(isPublicBusinessUrl("https://www.mdeai.co")).toBe(true);
  });
});
