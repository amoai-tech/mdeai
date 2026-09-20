import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { GooglePlacesSummary } from "./google-places-summary";

describe("GooglePlacesSummary", () => {
  it("renders provider disclosure whenever a Google Places AI summary is displayed", () => {
    const html = renderToStaticMarkup(
      <GooglePlacesSummary summary="A lively neighborhood cafe." disclosure="Summarized with Gemini" />,
    );
    expect(html).toContain("A lively neighborhood cafe.");
    expect(html).toContain("Summarized with Gemini");
  });

  it("does not render a provider summary without disclosure", () => {
    const html = renderToStaticMarkup(
      <GooglePlacesSummary summary="A lively neighborhood cafe." disclosure="" />,
    );
    expect(html).not.toContain("A lively neighborhood cafe.");
  });
});
