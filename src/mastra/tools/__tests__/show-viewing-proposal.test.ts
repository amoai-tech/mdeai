import { describe, expect, it } from "vitest";
import { EventType, type BaseEvent } from "@ag-ui/client";
import { of, toArray } from "rxjs";
import type { z } from "zod";
import { showViewingProposalTool } from "../show-viewing-proposal";
import { buildViewingProposalOps } from "../../lib/viewing-proposal-ui";
import { emitRecommendationSurface, viewingProposalFromResult } from "../../lib/recommendation-surface-bridge";
import { RENTAL_A2UI_CONTEXT_DESCRIPTION } from "@/lib/rentals/a2ui-context";
import { mdeUI } from "@/components/copilot/a2ui/mde-ui-catalog";
import { RENTAL_RECOMMENDATIONS_COMPONENTS } from "@/components/copilot/a2ui/rental-recommendations-surface";

const second = "37a05b09-f560-4776-92fd-b8bb2b92e611";
const future = new Date(Date.now() + 20 * 86_400_000).toISOString().slice(0, 10);

function context(route: string, ids: string[]) {
  return { requestContext: { get: (key: string) => key === "ag-ui"
    ? { context: [
        { description: RENTAL_A2UI_CONTEXT_DESCRIPTION, value: JSON.stringify(ids) },
        { description: "Active MDE discovery page, filters, and explicitly selected visible public item.",
          value: JSON.stringify({ route, selectedPublicEntityId: null }) },
      ] }
    : undefined } };
}
const run = (input: { listingId: string; date?: string; time?: string }, route = "/rentals", ids = [second]) =>
  showViewingProposalTool.execute!(input, context(route, ids) as never);

describe("showViewingProposal tool", () => {
  it("accepts a published apartment and carries only the validated proposal", async () => {
    expect(await run({ listingId: second, time: "15:15" })).toMatchObject({ ok: true, listingId: second, time: "15:15" });
  });

  it("rejects an apartment that is not on the page, and any page other than Rentals", async () => {
    expect(await run({ listingId: "someone-elses-listing" })).toMatchObject({ ok: false });
    expect(await run({ listingId: second }, "/chat")).toMatchObject({ ok: false });
  });

  it("drops a past or impossible date (a model guess) and keeps a real future one", async () => {
    const past = await run({ listingId: second, date: "2026-01-15", time: "15:15" });
    expect(past).toMatchObject({ ok: true, time: "15:15" });
    expect(past).not.toHaveProperty("date");
    expect(await run({ listingId: second, date: "2026-02-30" })).not.toHaveProperty("date");
    expect(await run({ listingId: second, date: future, time: "16:00" })).toMatchObject({ date: future, time: "16:00" });
  });

  it("drops an impossible time instead of passing it on", async () => {
    expect(await run({ listingId: second, time: "25:99" })).not.toHaveProperty("time");
  });

  it("keeps a real future date even when the time is invalid", async () => {
    const result = await run({ listingId: second, date: future, time: "25:99" });
    expect(result).toMatchObject({ ok: true, date: future });
    expect(result).not.toHaveProperty("time");
  });
});

describe("viewing proposal surface", () => {
  it("builds one versioned createSurface that only uses allowed, defined components with valid props", () => {
    const built = buildViewingProposalOps({ listingId: second, time: "15:15" }, "s1");
    const op = built.operations[0] as { version: string; createSurface: { components: Array<Record<string, unknown>> } };
    expect(op.version).toBe("1.0");
    for (const node of op.createSurface.components) {
      expect(RENTAL_RECOMMENDATIONS_COMPONENTS as readonly string[]).toContain(node.component);
      expect(mdeUI.components.has(node.component as string)).toBe(true);
    }
    const proposal = op.createSurface.components.find((node) => node.component === "ViewingProposal")!;
    const props = Object.fromEntries(Object.entries(proposal).filter(([key]) => key !== "id" && key !== "component"));
    const schema = mdeUI.components.get("ViewingProposal")!.props as z.ZodTypeAny;
    expect(schema.safeParse(props).success).toBe(true);
  });
});

describe("stable proposal surface", () => {
  it("replaces the previous proposal instead of stacking a new one per request", () => {
    const first = buildViewingProposalOps({ listingId: second }, undefined, { replace: true });
    const again = buildViewingProposalOps({ listingId: second, time: "16:00" }, undefined, { replace: true });
    const ids = (built: typeof first) =>
      built.operations.map((op) => {
        const o = op as { deleteSurface?: { surfaceId: string }; createSurface?: { surfaceId: string } };
        return o.deleteSurface?.surfaceId ?? o.createSurface?.surfaceId;
      });
    expect(ids(first)).toEqual(["viewing-proposal", "viewing-proposal"]);
    expect(ids(again)).toEqual(ids(first));
    expect(Object.keys(first.operations[0])).toContain("deleteSurface");
    expect(Object.keys(first.operations[1])).toContain("createSurface");
  });
});

describe("bridge", () => {
  const start = (id: string, name: string) => ({ type: EventType.TOOL_CALL_START, toolCallId: id, toolCallName: name }) as BaseEvent;
  const result = (id: string, content: unknown) => ({ type: EventType.TOOL_CALL_RESULT, toolCallId: id, content }) as BaseEvent;
  const collect = (events: BaseEvent[]) =>
    new Promise<BaseEvent[]>((resolve) => of(...events).pipe(emitRecommendationSurface(), toArray()).subscribe(resolve));

  it("appends the render_ui call after a successful proposal and nothing after a rejected one", async () => {
    const ok = await collect([start("c1", "showViewingProposal"), result("c1", JSON.stringify({ ok: true, listingId: second }))]);
    expect(ok.map((e) => e.type)).toEqual([
      EventType.TOOL_CALL_START, EventType.TOOL_CALL_RESULT,
      EventType.TOOL_CALL_START, EventType.TOOL_CALL_ARGS, EventType.TOOL_CALL_END,
    ]);
    const args = ok.find((e) => e.type === EventType.TOOL_CALL_ARGS) as unknown as { delta: string };
    expect(JSON.parse(args.delta).operations[0]).toHaveProperty("deleteSurface");
    const rejected = await collect([start("c2", "showViewingProposal"), result("c2", JSON.stringify({ ok: false, message: "x" }))]);
    expect(rejected).toHaveLength(2);
  });

  it("reads the proposal from an object, a JSON string or a nested result", () => {
    expect(viewingProposalFromResult({ ok: true, listingId: second, time: "16:00" })).toEqual({ listingId: second, time: "16:00" });
    expect(viewingProposalFromResult(JSON.stringify({ ok: true, listingId: second }))).toEqual({ listingId: second });
    expect(viewingProposalFromResult({ result: { ok: true, listingId: second } })).toEqual({ listingId: second });
    expect(viewingProposalFromResult("not json")).toBeNull();
  });
});
