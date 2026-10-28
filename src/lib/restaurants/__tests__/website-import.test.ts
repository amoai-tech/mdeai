import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  cleanDraftValue,
  extractRestaurantWebsiteDraft,
  parseDraftJson,
  RestaurantWebsiteImportError,
} from "@/lib/restaurants/website-import";

const MODEL_OUTPUT = {
  steps: [
    {
      type: "url_context_result",
      result: [{ url: "https://cafe.example/menu", status: "success" }],
    },
    {
      type: "model_output",
      content: [
        {
          type: "text",
          text: JSON.stringify({
            name: "Cafe Ejemplo",
            description: "A neighbourhood cafe.",
            website: "https://cafe.example",
            phone: null,
            price_level: 2,
            cuisine_types: ["Coffee", "Bakery"],
            unknownFields: ["email"],
          }),
        },
      ],
    },
  ],
};

beforeEach(() => {
  vi.stubEnv("GOOGLE_GENERATIVE_AI_API_KEY", "test-key");
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function respondWith(payload: unknown, status = 200) {
  const fetchMock = vi.fn().mockResolvedValue(
    new Response(JSON.stringify(payload), {
      status,
      headers: { "Content-Type": "application/json" },
    }),
  );
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

describe("parseDraftJson", () => {
  it("extracts the first JSON object from prose and fences", () => {
    expect(parseDraftJson('Here you go:\n```json\n{"name":"Cafe"}\n```')).toEqual({
      name: "Cafe",
    });
    expect(parseDraftJson("no json here")).toBeNull();
  });
});

describe("cleanDraftValue", () => {
  it("drops null and blank values so an unknown fact is never shown", () => {
    expect(
      cleanDraftValue({ name: " Cafe ", phone: null, tags: [], empty: "  " }),
    ).toEqual({ name: "Cafe" });
    expect(cleanDraftValue(null)).toBeUndefined();
  });
});

describe("extractRestaurantWebsiteDraft", () => {
  it("rejects a private URL before calling the provider", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    await expect(
      extractRestaurantWebsiteDraft("http://127.0.0.1/admin"),
    ).rejects.toMatchObject({ code: "invalid_url" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns only sourced, validated facts", async () => {
    const fetchMock = respondWith(MODEL_OUTPUT);
    const draft = await extractRestaurantWebsiteDraft("https://cafe.example");
    expect(draft).toMatchObject({
      name: "Cafe Ejemplo",
      price_level: 2,
      cuisine_types: ["Coffee", "Bakery"],
      sources: ["https://cafe.example/menu"],
      unknownFields: ["email"],
    });
    expect(draft.phone).toBeUndefined();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(String(init.body));
    expect(body.tools).toEqual([{ type: "url_context" }]);
    expect(body.input).toContain("https://cafe.example/");
  });

  it("fails honestly when the page was not confirmed as retrieved", async () => {
    respondWith({
      steps: [
        {
          type: "model_output",
          content: [{ type: "text", text: '{"name":"Cafe"}' }],
        },
      ],
    });
    await expect(
      extractRestaurantWebsiteDraft("https://cafe.example"),
    ).rejects.toMatchObject({ code: "invalid_output" });
  });

  it("fails honestly when the model returns no usable fields", async () => {
    respondWith({
      steps: [
        { type: "url_context_result", result: [{ url: "https://cafe.example", status: "success" }] },
        { type: "model_output", content: [{ type: "text", text: "I could not read that page." }] },
      ],
    });
    await expect(
      extractRestaurantWebsiteDraft("https://cafe.example"),
    ).rejects.toMatchObject({ code: "invalid_output" });
  });

  it("maps a provider error to a recoverable failure", async () => {
    respondWith({ error: "boom" }, 500);
    await expect(
      extractRestaurantWebsiteDraft("https://cafe.example"),
    ).rejects.toBeInstanceOf(RestaurantWebsiteImportError);
  });

  it("reports a timeout distinctly", async () => {
    const timeout = new Error("The operation was aborted due to timeout");
    timeout.name = "TimeoutError";
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(timeout));
    await expect(
      extractRestaurantWebsiteDraft("https://cafe.example"),
    ).rejects.toMatchObject({ code: "timeout" });
  });
});
