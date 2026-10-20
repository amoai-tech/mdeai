import { describe, expect, it } from "vitest";
import { parseSearchGroundedSidecarPayload } from "./search-grounding-types";

describe("parseSearchGroundedSidecarPayload", () => {
  it("parses citations with valid URLs", () => {
    const out = parseSearchGroundedSidecarPayload({
      citations: [
        {
          url: "https://example.com/a",
          title: "Article",
        },
      ],
      confidence: 0.8,
      metadata: {
        reason: null,
        source: "google-search-grounding",
        webSearchQueries: ["query one"],
        answer: "Summary.",
      },
    });
    expect(out.citations).toHaveLength(1);
    expect(out.citations[0]?.url).toBe("https://example.com/a");
    expect(out.metadata.reason).toBeNull();
    expect(out.webSearchQueries).toEqual(["query one"]);
  });

  it("rejects invented URLs and fail-closes", () => {
    const out = parseSearchGroundedSidecarPayload({
      citations: [{ url: "ftp://bad", title: "X" }],
      confidence: 0,
      metadata: { reason: null, source: "google-search-grounding" },
    });
    expect(out.citations).toHaveLength(0);
    expect(out.metadata.reason).toBe("no_grounding_metadata");
  });

  it("rejects response citations with missing or forged Google provenance", () => {
    for (const metadata of [undefined, { source: "cached" }, { source: "google-search-grounding", reason: "adk_unavailable" }]) {
      const out = parseSearchGroundedSidecarPayload({
        citations: [{ url: "https://example.com/unverified", title: "Unverified" }],
        confidence: 0.9,
        metadata,
      });
      expect(out.citations).toEqual([]);
      expect(out.confidence).toBe(0);
      expect(out.metadata.source).toBe("unverified");
      expect(out.metadata.reason).toBeTruthy();
    }
  });

  it("does not manufacture confidence or allow malformed URLs", () => {
    const out = parseSearchGroundedSidecarPayload({
      citations: [
        { url: "http-not-a-url", title: "Bad" },
        { url: "https://example.com/real", title: "Actual" },
      ],
      metadata: { source: "google-search-grounding", reason: null },
    });
    expect(out.citations.map((citation) => citation.url)).toEqual(["https://example.com/real"]);
    expect(out.confidence).toBe(0);
    expect(out.metadata.source).toBe("google-search-grounding");
  });

  it("does not surface links when the sidecar says Search was disabled", () => {
    const out = parseSearchGroundedSidecarPayload({
      citations: [{ url: "https://example.com/old", title: "Old" }],
      confidence: 1,
      metadata: { source: "google-search-grounding", reason: "search_disabled", searchDisabled: true },
    });
    expect(out.citations).toEqual([]);
    expect(out.metadata.source).toBe("unverified");
  });

  it("handles search_disabled stub", () => {
    const out = parseSearchGroundedSidecarPayload({
      citations: [],
      confidence: 0,
      metadata: {
        reason: "search_disabled",
        source: "google-search-grounding",
        searchDisabled: true,
      },
    });
    expect(out.metadata.searchDisabled).toBe(true);
    expect(out.metadata.reason).toBe("search_disabled");
  });
});
