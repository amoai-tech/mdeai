import { describe, expect, it } from "vitest";
import { z } from "zod";
import { rentalSchema } from "@/mastra/tools/search-rentals";
import { toDetailRental } from "@/lib/rentals/chat-rental-detail";

/**
 * SAN-1504 — `toDetailRental` is a browser-side copy of `rentalSchema` (the schema lives in a server
 * module the browser must not import). A copy can drift. This test builds a row FROM the real schema
 * and checks the copy against it, so adding, removing or retyping a field in `rentalSchema` fails
 * here instead of silently making every chat Details button fall back to the old pop-up.
 */

/** One valid sample value for a schema field. An unsupported field type throws: extend this, then re-check the copy. */
function sample(type: z.ZodTypeAny): unknown {
  if (type instanceof z.ZodOptional) return sample(type.unwrap());
  if (type instanceof z.ZodNullable) return null;
  if (type instanceof z.ZodString) return "x";
  if (type instanceof z.ZodNumber) return 1;
  if (type instanceof z.ZodBoolean) return true;
  if (type instanceof z.ZodArray && type.element instanceof z.ZodString) return ["x"];
  throw new Error(`rentalSchema has a field type this drift test does not know (${type.constructor.name})`);
}

const shape = rentalSchema.shape as Record<string, z.ZodTypeAny>;
const fullRow = Object.fromEntries(Object.entries(shape).map(([key, type]) => [key, sample(type)]));

describe("toDetailRental stays in step with rentalSchema (SAN-1504)", () => {
  it("the sample row really is a valid rental, and the copy accepts it", () => {
    expect(rentalSchema.safeParse(fullRow).success).toBe(true);
    expect(toDetailRental(fullRow)).not.toBeNull();
  });

  it.each(Object.keys(shape).filter((key) => !shape[key].isOptional()))(
    "required field %s: the copy refuses a row without it",
    (key) => {
      const row = { ...fullRow };
      delete row[key];
      expect(toDetailRental(row)).toBeNull();
    },
  );

  it.each(Object.keys(shape).filter((key) => shape[key].isOptional()))(
    "optional field %s: the copy accepts a row without it",
    (key) => {
      const row = { ...fullRow };
      delete row[key];
      expect(toDetailRental(row)).not.toBeNull();
    },
  );

  it.each(Object.keys(shape))("field %s: the copy refuses a value of the wrong type", (key) => {
    expect(toDetailRental({ ...fullRow, [key]: { wrong: "type" } })).toBeNull();
  });
});
