import { describe, expect, it } from "vitest";
import {
  DEFAULT_TRIP_TIMEZONE,
  isValidTimeZone,
  resolveTripTimeZone,
} from "../timezone";

describe("timezone validation", () => {
  it.each(["", "Bogota", "Invalid/Timezone", "America/Bogota ", " UTC"])(
    "rejects malformed value %j and falls back",
    (value) => {
      expect(isValidTimeZone(value)).toBe(false);
      expect(resolveTripTimeZone(value)).toBe(DEFAULT_TRIP_TIMEZONE);
    },
  );

  it("preserves a valid non-Medellín IANA timezone", () => {
    expect(resolveTripTimeZone("America/New_York")).toBe("America/New_York");
  });

  it("preserves UTC", () => {
    expect(resolveTripTimeZone("UTC")).toBe("UTC");
  });
});
