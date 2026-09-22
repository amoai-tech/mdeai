import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchWithRetry, retryOperation, shouldRetryHttpStatus } from "../../.claude/skills/maps/scripts/network-retry.mjs";

describe("Maps network retry helper", () => {
  afterEach(() => vi.restoreAllMocks());
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
  it("rejects non-HTTPS URLs before calling fetch", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    await expect(fetchWithRetry("http://example.com")).rejects.toThrow(TypeError);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("retries transient HTTP responses before succeeding", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response("busy", { status: 429 }))
      .mockResolvedValueOnce(new Response("ok", { status: 200 }));

    const response = await fetchWithRetry("https://example.com", {}, { attempts: 2, delayMs: 0, timeoutMs: 100 });
    expect(response.status).toBe(200);
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it("aborts a timed-out fetch", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation((_url, options) => new Promise((_resolve, reject) => {
      options?.signal?.addEventListener("abort", () => reject(options.signal?.reason ?? new Error("aborted")), { once: true });
    }));

    await expect(fetchWithRetry("https://example.com", {}, { attempts: 1, delayMs: 0, timeoutMs: 5 })).rejects.toBeTruthy();
  });

});
