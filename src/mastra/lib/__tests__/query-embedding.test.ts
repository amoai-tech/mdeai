import { describe, it, expect, vi, afterEach } from "vitest";
import { embedQueryText, embedQueryTextDetailed, vectorLiteral } from "../query-embedding";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("embedQueryText", () => {
  it("returns null when GOOGLE_GENERATIVE_AI_API_KEY is absent", async () => {
    const orig = process.env.GOOGLE_GENERATIVE_AI_API_KEY;
    delete process.env.GOOGLE_GENERATIVE_AI_API_KEY;
    const result = await embedQueryText("quiet rooftop Provenza");
    expect(result).toBeNull();
    if (orig !== undefined) process.env.GOOGLE_GENERATIVE_AI_API_KEY = orig;
  });

  it("returns null when text is empty", async () => {
    process.env.GOOGLE_GENERATIVE_AI_API_KEY = "test-key";
    const result = await embedQueryText("   ");
    expect(result).toBeNull();
  });

  it("returns null on HTTP error response", async () => {
    process.env.GOOGLE_GENERATIVE_AI_API_KEY = "test-key";
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: false, status: 429 }),
    );
    const result = await embedQueryText("hello");
    expect(result).toBeNull();
  });

  it("embedQueryTextDetailed reports HTTP 403 as http_error", async () => {
    process.env.GOOGLE_GENERATIVE_AI_API_KEY = "test-key";
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: false, status: 403 }),
    );
    const result = await embedQueryTextDetailed("2BR near Estadio");
    expect(result).toEqual({ ok: false, reason: "http_error", status: 403 });
  });

  it("returns null when fetch throws (network failure)", async () => {
    process.env.GOOGLE_GENERATIVE_AI_API_KEY = "test-key";
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new Error("network error")),
    );
    const result = await embedQueryText("hello");
    expect(result).toBeNull();
  });

  it("returns null when embedding values are missing from response", async () => {
    process.env.GOOGLE_GENERATIVE_AI_API_KEY = "test-key";
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ embedding: {} }),
      }),
    );
    const result = await embedQueryText("hello");
    expect(result).toBeNull();
  });

  it("returns values array on success", async () => {
    process.env.GOOGLE_GENERATIVE_AI_API_KEY = "test-key";
    const fakeValues = Array.from({ length: 768 }, (_, i) => i / 1000);
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ embedding: { values: fakeValues } }),
      }),
    );
    const result = await embedQueryText("hello");
    expect(result).toHaveLength(768);
    expect(result![0]).toBeCloseTo(0);
  });

  it("uses a Gemini API header and never puts the key in the request URL", async () => {
    process.env.GOOGLE_GENERATIVE_AI_API_KEY = "test-key";
    const mockedFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ embedding: { values: Array(768).fill(0.01) } }),
    });
    vi.stubGlobal("fetch", mockedFetch);
    const result = await embedQueryTextDetailed("quiet balcony");
    expect(result.ok).toBe(true);
    const [url, init] = mockedFetch.mock.calls[0] as [string, RequestInit];
    expect(url).not.toContain("test-key");
    expect((init.headers as Record<string, string>)["x-goog-api-key"]).toBe("test-key");
  });

  it("rejects wrong-dimensional and non-finite query vectors", async () => {
    process.env.GOOGLE_GENERATIVE_AI_API_KEY = "test-key";
    for (const values of [Array(767).fill(0.01), [...Array(767).fill(0.01), NaN]]) {
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ embedding: { values } }),
      }));
      expect(await embedQueryTextDetailed("balcony")).toEqual({ ok: false, reason: "empty_response" });
    }
  });
});

describe("embedQueryTextDetailed deadline", () => {
  it("gives up on a stalled Gemini call and reports network_error so keyword search can run", async () => {
    process.env.GOOGLE_GENERATIVE_AI_API_KEY = "test-key";
    // Shrink the real 5 s deadline so the test proves the actual abort path, not a mock rejection.
    vi.spyOn(AbortSignal, "timeout").mockReturnValue(AbortSignal.timeout(20));
    vi.stubGlobal(
      "fetch",
      vi.fn((_url: string, init: RequestInit) =>
        new Promise((_resolve, reject) => {
          init.signal?.addEventListener("abort", () => reject(init.signal?.reason));
        }),
      ),
    );
    expect(await embedQueryTextDetailed("quiet balcony")).toEqual({ ok: false, reason: "network_error" });
  });
});

describe("vectorLiteral", () => {
  it("formats array as pgvector literal", () => {
    expect(vectorLiteral([0.1, 0.2, 0.3])).toBe("[0.1,0.2,0.3]");
  });
});
