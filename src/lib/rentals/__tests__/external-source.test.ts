import { describe, expect, it } from "vitest";
import { approvedExternalSourceUrl, externalListingLink } from "../external-source";

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
