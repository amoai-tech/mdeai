// @vitest-environment jsdom
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MapsUnavailable } from "@/components/maps/map-referer-help";

/** A renter cannot fix a Google Cloud key, so production never shows setup steps or env var names. */
describe("MapsUnavailable — what a renter sees", () => {
  afterEach(() => vi.unstubAllEnvs());

  it.each(["auth-failed", "no-key"] as const)("production shows a plain notice for %s", (reason) => {
    vi.stubEnv("NODE_ENV", "production");
    const html = renderToStaticMarkup(<MapsUnavailable reason={reason} />);
    expect(html).toContain("The map isn&#x27;t available right now");
    expect(html).toContain("Your results are still listed");
    expect(html).not.toMatch(/GCP|NEXT_PUBLIC|\.env|BillingNotEnabled|RefererNotAllowed/i);
  });

  it("development still shows the developer setup steps", () => {
    const html = renderToStaticMarkup(<MapsUnavailable reason="auth-failed" />);
    expect(html).toContain("Google Maps authentication failed");
    expect(html).toContain("NEXT_PUBLIC_GOOGLE_MAPS_API_KEY");
  });
});
