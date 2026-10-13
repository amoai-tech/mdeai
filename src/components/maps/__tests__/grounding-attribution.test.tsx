/**
 * SAN-878 · GND-002 — Maps attribution ToS on grounded cards.
 * Google's Grounding with Google Maps rule: each grounded result shows its source name, links to the
 * source URL, and attributes it as "Google Maps" (unchanged text, not translated).
 */
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { GroundingAttribution } from "@/components/maps/GroundingAttribution";

describe("GroundingAttribution (compact, one source)", () => {
  it("attributes the source to Google Maps, names it, and links to its URL", () => {
    const html = renderToStaticMarkup(
      <GroundingAttribution
        compact
        rows={[{ placeUri: "https://maps.google.com/?cid=1", title: "Pausa Coffee & Brunch" }]}
      />,
    );
    expect(html).toContain('data-testid="grounding-attribution"');
    expect(html).toContain('translate="no"');
    expect(html).toContain('href="https://maps.google.com/?cid=1"');
    expect(html).toContain("Google Maps");
    expect(html).toContain("Pausa Coffee &amp; Brunch");
  });

  it("still attributes to Google Maps when there is no URL, without inventing a link", () => {
    const html = renderToStaticMarkup(<GroundingAttribution compact rows={[{ title: "Pausa" }]} />);
    expect(html).toContain("Google Maps");
    expect(html).toContain('translate="no"');
    expect(html).not.toContain("<a ");
  });

  it("shows Google's source name exactly as given, without editing it", () => {
    const html = renderToStaticMarkup(
      <GroundingAttribution compact rows={[{ placeUri: "https://maps.google.com/?cid=1", title: "Cafe Euge - Google Maps" }]} />,
    );
    expect(html).toContain("Cafe Euge - Google Maps");
  });

  it("keeps the words Google Maps on one line, untranslated, in one of Google's allowed colours", () => {
    const html = renderToStaticMarkup(
      <GroundingAttribution compact rows={[{ placeUri: "https://maps.google.com/?cid=1", title: "Pausa" }]} />,
    );
    const span = html.match(/<span[^>]*>Google Maps<\/span>/)?.[0] ?? "";
    expect(span).toContain('translate="no"');
    expect(span).toContain("whitespace-nowrap");
    expect(span).toContain("font-normal");
    expect(span).toContain("text-[#5e5e5e]");
    expect(span).toContain("dark:text-white");
  });
});
