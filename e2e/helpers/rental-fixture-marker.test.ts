import { describe, expect, it } from "vitest";
import { E2E_FIXTURE_METADATA, E2E_FIXTURE_SOURCE } from "./rental-fixture-marker";

describe("E2E rental fixture marker", () => {
  it("uses the metadata key the SAN-468 inventory-quality report classifies on", () => {
    expect(E2E_FIXTURE_METADATA.is_test_fixture).toBe(true);
    expect(E2E_FIXTURE_METADATA.fixture_source).toBe(E2E_FIXTURE_SOURCE);
  });

  it("serializes is_test_fixture so metadata->>'is_test_fixture' is the string 'true'", () => {
    const roundTripped = JSON.parse(JSON.stringify(E2E_FIXTURE_METADATA)) as Record<string, unknown>;
    expect(String(roundTripped.is_test_fixture)).toBe("true");
  });
});
