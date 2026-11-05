import { describe, expect, it } from "vitest";
import type { z } from "zod";
import {
  collectRentalResults,
  findRentalRow,
  mdeUI,
  rentalDetailHref,
  selectRentalMessages,
} from "../mde-ui-catalog";

const laureles = {
  results: [
    { id: "real-1", title: "Bright 2BR", neighborhood: "Laureles", price_monthly: 3_800_000, currency: "COP" },
  ],
};
const poblado = {
  results: [
    { id: "real-2", title: "Poblado Studio", neighborhood: "El Poblado", price_monthly: 4_500_000, currency: "COP" },
  ],
};

describe("MDE A2UI catalog", () => {
  it("exports a small, versioned catalog with only RentalCard", () => {
    expect(mdeUI.id).toBe("mde/discovery@1");
    expect([...mdeUI.components.keys()]).toEqual(["RentalCard"]);
  });

  it("keeps an older card usable after a newer search", () => {
    // Newest result first, exactly as collectRentalResults returns them.
    const results = [poblado, laureles];
    expect(findRentalRow(results, "real-1")).toMatchObject({
      title: "Bright 2BR",
      neighborhood: "Laureles",
    });
    expect(findRentalRow([poblado], "real-1")).toBeNull();
    expect(findRentalRow(results, "forged-id")).toBeNull();
    expect(findRentalRow(results, "0")).toBeNull();
    expect(findRentalRow([], "real-1")).toBeNull();
  });

  it("collects every finished rental result on the thread, newest first", () => {
    const messages = [
      { role: "user", content: "Laureles" },
      { role: "assistant", toolCalls: [{ id: "a", function: { name: "searchRentalsTool" } }] },
      { role: "tool", toolCallId: "a", content: JSON.stringify(laureles) },
      { role: "user", content: "El Poblado" },
      { role: "assistant", toolCalls: [{ id: "b", function: { name: "search-rentals" } }] },
      { role: "tool", toolCallId: "b", content: JSON.stringify(poblado) },
    ];
    const results = collectRentalResults(messages);
    expect(results).toHaveLength(2);
    expect(findRentalRow(results, "real-1")).toMatchObject({ title: "Bright 2BR" });
    expect(findRentalRow(results, "real-2")).toMatchObject({ title: "Poblado Studio" });
  });

  it("falls back to the active agent when broker chat has no concierge coagent", () => {
    const direct = [{ role: "tool", toolCallId: "a", content: JSON.stringify(laureles) }];
    expect(selectRentalMessages(undefined, direct)).toEqual(direct);
    expect(selectRentalMessages([], direct)).toEqual(direct);
    expect(selectRentalMessages(direct, undefined)).toEqual(direct);
  });

  it("routes broker details to the canonical rental page", () => {
    expect(rentalDetailHref("37a05b09-f560-4776-92fd-b8bb2b92e611")).toBe(
      "/rentals/37a05b09-f560-4776-92fd-b8bb2b92e611",
    );
    expect(rentalDetailHref("a/b")).toBe("/rentals/a%2Fb");
  });

  it("accepts only a non-empty opaque listingId", () => {
    const props = mdeUI.components.get("RentalCard")?.props as z.ZodTypeAny | undefined;
    expect(props).toBeDefined();
    expect(props?.safeParse({ listingId: "external-listing-42" }).success).toBe(true);
    expect(props?.safeParse({ listingId: "" }).success).toBe(false);
    expect(props?.safeParse({ listingId: 42 }).success).toBe(false);
    expect(props?.safeParse({ price: 2_400_000 }).success).toBe(false);
  });
});
