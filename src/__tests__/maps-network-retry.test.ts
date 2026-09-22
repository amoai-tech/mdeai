import { describe, expect, it } from "vitest";
import { retryOperation, shouldRetryHttpStatus } from "../../.claude/skills/maps/scripts/network-retry.mjs";

describe("Maps network retry helper", () => {
  it("retries transient failures and returns the eventual result", async () => {
    let attempts = 0;
    const result = await retryOperation(async () => {
      attempts += 1;
      if (attempts < 3) throw new Error("temporary network failure");
      return "ok";
    }, { attempts: 3, delayMs: 0 });

    expect(result).toBe("ok");
    expect(attempts).toBe(3);
  });

  it("classifies only transient HTTP statuses for retry", () => {
    for (const status of [408, 425, 429, 500, 502, 503, 504]) expect(shouldRetryHttpStatus(status)).toBe(true);
    for (const status of [200, 301, 400, 401, 403, 404]) expect(shouldRetryHttpStatus(status)).toBe(false);
  });
});
