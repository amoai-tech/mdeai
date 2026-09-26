import { google } from "@ai-sdk/google";
import { generateObject, generateText, tool } from "ai";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { GEMINI_FLASH_MODEL_ID } from "@/lib/ai-model-ids";

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
 * proof on demand. A skipped run is not evidence — run it locally when changing
 * the model id (see the PR/commit that introduced it for the recorded result).
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
      });
    }, 60_000);
  },
);
