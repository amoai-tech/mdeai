import { afterEach, describe, expect, it, vi } from "vitest";
import { isSearchGroundingEnabled } from "../is-search-grounding-enabled";

describe("isSearchGroundingEnabled", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("can opt in Vercel production explicitly when ENABLE_SEARCH_GROUNDING=1", () => {
    vi.stubEnv("VERCEL_ENV", "production");
    vi.stubEnv("ENABLE_SEARCH_GROUNDING", "1");
    expect(isSearchGroundingEnabled()).toBe(true);
  });

  it("follows ENABLE_SEARCH_GROUNDING on preview", () => {
    vi.stubEnv("VERCEL_ENV", "preview");
    vi.stubEnv("ENABLE_SEARCH_GROUNDING", "1");
    expect(isSearchGroundingEnabled()).toBe(true);
    vi.stubEnv("ENABLE_SEARCH_GROUNDING", "0");
    expect(isSearchGroundingEnabled()).toBe(false);
  });

  it("is false when flag unset locally", () => {
    vi.stubEnv("VERCEL_ENV", "");
    vi.stubEnv("ENABLE_SEARCH_GROUNDING", "");
    expect(isSearchGroundingEnabled()).toBe(false);
  });
});
