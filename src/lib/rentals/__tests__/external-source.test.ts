import { describe, expect, it } from "vitest";
import {
  APPROVED_EXTERNAL_SOURCE_HOSTS,
  approvedExternalSourceUrl,
  externalListingLink,
} from "../external-source";

const APPROVED = "https://www.fincaraiz.com.co/apartamento/123";

describe("approvedExternalSourceUrl — the one allowlist", () => {
  it("accepts an approved advertiser over HTTPS", () => {
    expect(approvedExternalSourceUrl(APPROVED)).toBe("https://www.fincaraiz.com.co/apartamento/123");
  });

  it("accepts a subdomain of an approved advertiser", () => {
    expect(approvedExternalSourceUrl("https://listings.rentberry.com/x")).toBe("https://listings.rentberry.com/x");
  });

  it.each([
    ["plain HTTP", "http://www.fincaraiz.com.co/x"],
    ["an unapproved host", "https://example.com/x"],
    ["a look-alike host", "https://fincaraiz.com.co.evil.example.com/x"],
    ["embedded credentials", "https://attacker@fincaraiz.com.co/x"],
    ["a non-default port", "https://www.fincaraiz.com.co:8443/x"],
    ["an MDE self-link", "https://www.mdeai.co/rentals"],
    ["a relative path", "/rentals"],
    ["empty", ""],
  ])("rejects %s", (_label, value) => {
    expect(approvedExternalSourceUrl(value)).toBeNull();
  });
});

describe("externalListingLink — SAN-1612 shared display policy", () => {
  it("returns the href and a readable hostname without www", () => {
    expect(externalListingLink(APPROVED)).toEqual({
      href: "https://www.fincaraiz.com.co/apartamento/123",
      hostname: "fincaraiz.com.co",
    });
  });

  it("hides the link for a host the allowlist does not cover, exactly like the card", () => {
    expect(externalListingLink("https://example.com/listing")).toBeNull();
  });

  it("never exposes a port in the disclosure", () => {
    expect(externalListingLink("https://www.fincaraiz.com.co:8443/x")).toBeNull();
  });
});

describe("adding a legitimate new portal is a deliberate, tested code change", () => {
  // The allowlist is the control. A new advertiser is supported by naming it here — reviewed in a
  // PR — and this table proves every named host actually renders a safe outbound link. Widening
  // the rule (e.g. "any https host") is what would reopen the redirect vector, so it is not done.
  it.each(APPROVED_EXTERNAL_SOURCE_HOSTS.map((host) => [host]))("supports %s", (host) => {
    const url = `https://www.${host}/listing/1`;
    expect(approvedExternalSourceUrl(url)).toBe(url);
    expect(externalListingLink(url)).toEqual({ href: url, hostname: host });
  });

  it("keeps the allowlist explicit rather than open-ended", () => {
    // A guard against someone replacing the table with a wildcard: every entry must be a bare
    // hostname, never a pattern.
    for (const host of APPROVED_EXTERNAL_SOURCE_HOSTS) {
      expect(host).toMatch(/^[a-z0-9.-]+$/);
      expect(host).not.toContain("*");
    }
  });
});
