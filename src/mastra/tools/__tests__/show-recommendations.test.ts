import { describe, expect, it } from "vitest";
import { showRecommendationsTool } from "../show-recommendations";
import { RENTAL_A2UI_CONTEXT_DESCRIPTION } from "@/lib/rentals/a2ui-context";

const uuid = "37a05b09-f560-4776-92fd-b8bb2b92e611";
const slug = "candidate-fincaraiz-123";

function context(route: string, ids: string[]) {
  return { requestContext: { get: (key: string) => key === "ag-ui"
    ? { context: [
        { description: RENTAL_A2UI_CONTEXT_DESCRIPTION, value: JSON.stringify(ids) },
        { description: "Active MDE discovery page, filters, and explicitly selected visible public item.",
          value: JSON.stringify({ route, selectedPublicEntityId: null }) },
      ] }
    : undefined } };
}

async function execute(ids: string[], route = "/rentals", available = [uuid, slug]) {
  return showRecommendationsTool.execute!({ ids }, context(route, available) as never);
}

describe("showRecommendations — page-hint membership, not anonymous public eligibility", () => {
  it("includes a displayed provider slug and UUID without an extra public-only lookup", async () => {
    const result = await execute([slug, uuid]);
    expect(result).toMatchObject({ ok: true, ids: [slug, uuid], rejected: [] });
  });

  it("rejects IDs not in the current page, even if shaped like a valid ID", async () => {
    const result = await execute([uuid, "some-other-apartment"], "/rentals", [slug]);
    expect(result).toMatchObject({ ok: false, ids: [], rejected: [uuid, "some-other-apartment"] });
  });

  it("accepts valid members and rejects stale ones without rendering unauthorized facts", async () => {
    const result = await execute([uuid, slug]);
    expect(result).toMatchObject({ ok: true, ids: [uuid, slug], rejected: [] });
  });

  it("will not create Rentals page cards from /chat or /events", async () => {
    expect(await execute([uuid], "/chat")).toMatchObject({ ok: false, ids: [] });
    expect(await execute([uuid], "/events")).toMatchObject({ ok: false, ids: [] });
  });

  it("rejects when there are no published page results", async () => {
    expect(await execute([uuid], "/rentals", [])).toMatchObject({ ok: false, ids: [] });
  });
});
