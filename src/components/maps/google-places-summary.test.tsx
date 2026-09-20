import { describe, expect, it } from "vitest";
import { GooglePlacesSummary } from "./google-places-summary";

describe("GooglePlacesSummary", () => {
  it("renders provider disclosure whenever a Google Places AI summary is displayed", () => {
    const element = GooglePlacesSummary({
      summary: "A lively neighborhood cafe.",
      disclosure: "Summarized with Gemini",
    });

    expect(element).toMatchObject({
      props: {
        children: [
          { props: { children: "A lively neighborhood cafe." } },
          { props: { children: "Summarized with Gemini" } },
        ],
      },
    });
  });

  it("does not render a provider summary without disclosure", () => {
    expect(GooglePlacesSummary({ summary: "A lively neighborhood cafe.", disclosure: "" })).toBeNull();
  });

  it("does not render an empty provider summary even with disclosure", () => {
    expect(GooglePlacesSummary({ summary: "", disclosure: "Summarized with Gemini" })).toBeNull();
  });

  it("does not render a whitespace-only provider summary even with disclosure", () => {
    expect(GooglePlacesSummary({ summary: "   ", disclosure: "Summarized with Gemini" })).toBeNull();
  });
});
