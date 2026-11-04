import { strict as assert } from "node:assert";
import { getGeminiApiKey } from "../_shared/gemini.ts";

Deno.test("Gemini key prefers the explicit Edge variable", () => {
  const env: Record<string, string> = {
    GEMINI_API_KEY: "test-direct-key",
    GOOGLE_GENERATIVE_AI_API_KEY: "test-existing-key",
  };
  assert.equal(getGeminiApiKey((name) => env[name]), "test-direct-key");
});

Deno.test("Gemini key reuses production's existing Google variable", () => {
  assert.equal(
    getGeminiApiKey((name) =>
      name === "GOOGLE_GENERATIVE_AI_API_KEY" ? "test-existing-key" : undefined
    ),
    "test-existing-key",
  );
});

Deno.test("Gemini key fails closed when neither name is configured", () => {
  assert.throws(() => getGeminiApiKey(() => undefined), /not configured/);
});
