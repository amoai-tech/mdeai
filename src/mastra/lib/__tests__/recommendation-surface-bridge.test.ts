import { describe, expect, it } from "vitest";
import { EventType, type BaseEvent } from "@ag-ui/client";
import { of, toArray } from "rxjs";
import {
  emitRecommendationSurface,
  recommendationIdsFromResult,
  renderUiEventsFor,
} from "../recommendation-surface-bridge";

const id = (n: number) => `37a05b09-f560-4776-92fd-b8bb2b92e6${String(n).padStart(2, "0")}`;

describe("recommendationIdsFromResult", () => {
  it("reads ids from an object or a JSON string", () => {
    expect(recommendationIdsFromResult({ ok: true, ids: [id(1)] })).toEqual([id(1)]);
    expect(recommendationIdsFromResult(JSON.stringify({ ok: true, ids: [id(2)] }))).toEqual([id(2)]);
  });

  it("reads ids nested under result", () => {
    expect(recommendationIdsFromResult({ result: { ids: [id(3)] } })).toEqual([id(3)]);
  });

  it("returns nothing for a failed, empty or malformed result", () => {
    expect(recommendationIdsFromResult({ ok: false, ids: [id(1)] })).toEqual([]);
    expect(recommendationIdsFromResult("not json")).toEqual([]);
    expect(recommendationIdsFromResult(null)).toEqual([]);
  });
});

describe("renderUiEventsFor", () => {
  it("emits a start, one valid args delta and an end", () => {
    const events = renderUiEventsFor([id(1), id(2)], "call-1") ?? [];
    expect(events.map((e) => e.type)).toEqual([
      EventType.TOOL_CALL_START,
      EventType.TOOL_CALL_ARGS,
      EventType.TOOL_CALL_END,
    ]);
    const args = JSON.parse((events[1] as unknown as { delta: string }).delta);
    expect(args.target).toBe("rental-recommendations");
    expect(args.operations[0].version).toBe("1.0");
    expect(args.operations[0].createSurface.components[0].children).toEqual(["card-1", "card-2"]);
  });

  it("emits nothing without a valid id", () => {
    expect(renderUiEventsFor([], "call-1")).toBeNull();
  });
});

describe("emitRecommendationSurface", () => {
  const start = (id: string, name: string) => ({ type: EventType.TOOL_CALL_START, toolCallId: id, toolCallName: name }) as BaseEvent;
  const result = (id: string, content: unknown) => ({ type: EventType.TOOL_CALL_RESULT, toolCallId: id, content }) as BaseEvent;

  it("appends the synthetic render_ui call after the tool result", async () => {
    const events = await new Promise<BaseEvent[]>((resolve) => {
      of(start("c1", "showRecommendations"), result("c1", JSON.stringify({ ok: true, ids: [id(1)] })))
        .pipe(emitRecommendationSurface(), toArray())
        .subscribe(resolve);
    });
    expect(events.map((e) => e.type)).toEqual([
      EventType.TOOL_CALL_START,
      EventType.TOOL_CALL_RESULT,
      EventType.TOOL_CALL_START,
      EventType.TOOL_CALL_ARGS,
      EventType.TOOL_CALL_END,
    ]);
  });

  it("does not append anything for another tool or a rejected result", async () => {
    const other = await new Promise<BaseEvent[]>((resolve) => {
      of(start("c2", "searchRentalsTool"), result("c2", "{}")).pipe(emitRecommendationSurface(), toArray()).subscribe(resolve);
    });
    expect(other).toHaveLength(2);
    const rejected = await new Promise<BaseEvent[]>((resolve) => {
      of(start("c3", "showRecommendations"), result("c3", JSON.stringify({ ok: false, ids: [] })))
        .pipe(emitRecommendationSurface(), toArray())
        .subscribe(resolve);
    });
    expect(rejected).toHaveLength(2);
  });
});
