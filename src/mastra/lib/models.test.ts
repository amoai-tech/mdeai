import { google } from "@ai-sdk/google";
import { generateObject, generateText, tool } from "ai";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import {
  GEMINI_FLASH_MODEL_ID,
  GEMINI_MODEL_CAPABILITIES,
} from "@/lib/ai-model-ids";

/**
 * CI-enforced capability contract — runs everywhere, needs no key.
 *
 * The live proof below cannot run in CI (no Gemini key), so this asserts the
 * thing CI *can* assert: that whoever configured the current model recorded what
 * it supports, and that both capabilities MDE depends on are declared. A model
 * switch without that record fails here rather than silently shipping a fleet
 * that cannot call tools.
 */
describe("configured Gemini model capabilities are recorded", () => {
  it(`${GEMINI_FLASH_MODEL_ID} declares the capabilities the agents need`, () => {
    const capabilities = GEMINI_MODEL_CAPABILITIES[GEMINI_FLASH_MODEL_ID];
    expect(
      capabilities,
      `No capability record for "${GEMINI_FLASH_MODEL_ID}". Read the official model page ` +
        `before switching the model, then add a GEMINI_MODEL_CAPABILITIES entry stating ` +
        `whether it supports function calling and structured output, and on what basis.`,
    ).toBeDefined();
    expect(capabilities.functionCalling, "function calling").toBe(true);
    expect(capabilities.structuredOutput, "structured output").toBe(true);
    expect(capabilities.basis.length).toBeGreaterThan(20);
  });
});

/**
 * Capability proof for whichever model `GEMINI_FLASH_MODEL_ID` names.
 *
 * Switching the default model is a **behaviour** change, not a rename: MDE's
 * agents rely on tool calling, and two call sites rely on structured output
 * (`flash-route-classifier.ts`, `rental-intent-gemini.ts`). A model that cannot
 * do either would pass typecheck, lint and every unit test while failing every
 * real turn — so this asserts both against the live API.
 *
 * Gated on `GOOGLE_GENERATIVE_AI_API_KEY`: CI has no Gemini key, so it skips
 * there rather than failing, and any environment that does run AI gets the
 * proof on demand. Because a skip is not evidence, the CI-enforced contract
 * above carries the part CI can actually enforce.
 */
const hasGeminiKey = Boolean(process.env.GOOGLE_GENERATIVE_AI_API_KEY?.trim());

describe.skipIf(!hasGeminiKey)(
  `GEMINI_FLASH_MODEL_ID ("${GEMINI_FLASH_MODEL_ID}") live capabilities`,
  () => {
    const model = google(GEMINI_FLASH_MODEL_ID);

    it("supports structured output (generateObject)", async () => {
      const { object } = await generateObject({
        model,
        schema: z.object({
          action: z.enum(["search", "clarify", "skip"]),
          neighborhood: z.string().nullable(),
          maxPricePerNight: z.number().nullable(),
        }),
        prompt:
          "Extract Medellín rental search slots. User message: 1BR in Laureles under $80 per night",
      });

      expect(object.action).toBe("search");
      expect(object.neighborhood?.toLowerCase()).toContain("laureles");
      expect(object.maxPricePerNight).toBe(80);
    }, 60_000);

    it("supports tool calling (generateText + tools)", async () => {
      const { toolCalls } = await generateText({
        model,
        tools: {
          search_rentals: tool({
            description: "Search furnished rentals in Medellín",
            inputSchema: z.object({
              neighborhood: z.string(),
              maxPrice: z.number(),
            }),
            execute: async ({ neighborhood }) => ({ count: 3, neighborhood }),
          }),
        },
        prompt: "Use the search_rentals tool for 1BR in Laureles under $80 per night.",
      });

      expect(toolCalls.map((call) => call.toolName)).toContain("search_rentals");
      expect(toolCalls[0]?.input).toMatchObject({
        neighborhood: expect.stringMatching(/laureles/i),
        // "under $80" must survive into the argument. Without this the test still
        // passed for `maxPrice: 0` — the budget silently dropped, which is the
        // user-visible half of the request.
        maxPrice: 80,
      });
    }, 60_000);
  },
);
