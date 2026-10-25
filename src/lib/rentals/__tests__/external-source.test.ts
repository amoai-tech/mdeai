import { describe, expect, it } from "vitest";
import { approvedExternalSourceUrl } from "@/lib/rentals/external-source";

describe("approvedExternalSourceUrl — external-source allowlist (SAN-1502)", () => {
  it("returns an approved advertiser's HTTPS URL", () => {
    expect(approvedExternalSourceUrl("https://www.fincaraiz.com.co/property/123")).toBe(
      "https://www.fincaraiz.com.co/property/123",
    );
    expect(approvedExternalSourceUrl("https://apartamento.mercadolibre.com.co/x")).toBe(
      "https://apartamento.mercadolibre.com.co/x",
    );
    expect(approvedExternalSourceUrl("https://rentberry.com/listing/9")).toBe(
      "https://rentberry.com/listing/9",
    );
  });

  it("rejects an arbitrary HTTPS host — the open-redirect guard", () => {
    expect(approvedExternalSourceUrl("https://evil.example.com/fake-listing")).toBeNull();
    // A look-alike suffix must not pass.
    expect(approvedExternalSourceUrl("https://fincaraiz.com.co.evil.example.com/x")).toBeNull();
  });

  it("rejects embedded credentials that would make the approved host look safe", () => {
    // `new URL()` reports hostname fincaraiz.com.co while carrying "attacker" as the username.
    expect(approvedExternalSourceUrl("https://attacker@fincaraiz.com.co/phishing")).toBeNull();
    expect(approvedExternalSourceUrl("https://user:pass@www.fincaraiz.com.co/x")).toBeNull();
  });

  it("rejects an approved host on a non-default port", () => {
    expect(approvedExternalSourceUrl("https://fincaraiz.com.co:8443/x")).toBeNull();
    expect(approvedExternalSourceUrl("https://fincaraiz.com.co:443/x")).toBe(
      "https://fincaraiz.com.co/x",
    );
  });

  it("rejects non-HTTPS, MDE's own hosts, blanks and junk", () => {
    expect(approvedExternalSourceUrl("http://www.fincaraiz.com.co/property/123")).toBeNull();
    expect(approvedExternalSourceUrl("https://mdeai.co/rentals/x")).toBeNull();
    expect(approvedExternalSourceUrl("https://www.mdeai.co/rentals/x")).toBeNull();
    expect(approvedExternalSourceUrl("")).toBeNull();
    expect(approvedExternalSourceUrl(null)).toBeNull();
    expect(approvedExternalSourceUrl(undefined)).toBeNull();
    expect(approvedExternalSourceUrl("not a url")).toBeNull();
  });
});
