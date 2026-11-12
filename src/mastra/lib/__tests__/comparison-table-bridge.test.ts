import { describe, expect, it } from "vitest";
import { EventType, type BaseEvent } from "@ag-ui/client";
import { of, toArray } from "rxjs";
import {
  comparisonRowsFromResult,
  comparisonTableRenderEvents,
  emitRecommendationSurface,
} from "../recommendation-surface-bridge";

const rows = [
  { id: "a", title: "Calle 10 #42-15", bedrooms: 2, price: 2_400_000, currency: "COP", period: "month" },
  { id: "b", title: "Zitios", bedrooms: 2, price: 2_500_000, currency: "COP", period: "month" },
];

describe("comparisonRowsFromResult", () => {
  it("reads successful rows from an object or JSON string", () => {
    expect(comparisonRowsFromResult({ ok: true, rows })).toHaveLength(2);
    expect(comparisonRowsFromResult(JSON.stringify({ ok: true, rows }))).toHaveLength(2);
    expect(comparisonRowsFromResult({ result: { ok: true, rows } })).toHaveLength(2);
  });

  it("returns nothing for a failed or malformed result", () => {
    expect(comparisonRowsFromResult({ ok: false, rows })).toEqual([]);
    expect(comparisonRowsFromResult("not json")).toEqual([]);
  });
});

describe("comparisonTableRenderEvents", () => {
  it("emits one synthetic render_ui with a Column → Table operation", () => {
    const events = comparisonTableRenderEvents(rows as never, "call-1");
    expect(events.map((event) => event.type)).toEqual([
      EventType.TOOL_CALL_START,
      EventType.TOOL_CALL_ARGS,
      EventType.TOOL_CALL_END,
    ]);
    expect((events[0] as { toolCallName?: string }).toolCallName).toBe("render_ui");
    const args = JSON.parse((events[1] as unknown as { delta: string }).delta) as {
      target: string;
      operations: Array<{ createSurface?: { components: Array<Record<string, unknown>> } }>;
    };
    expect(args.target).toBe("chat");
    const create = args.operations.find((operation) => operation.createSurface) as {
      createSurface: { components: Array<Record<string, unknown>> };
    };
    expect(create.createSurface.components[0]).toMatchObject({ component: "Column" });
    expect(create.createSurface.components[1]).toMatchObject({ component: "Table" });
  });

  it("emits nothing for an invalid row set", () => {
    expect(comparisonTableRenderEvents([rows[0]] as never, "call-1")).toEqual([]);
  });
});

describe("emitRecommendationSurface comparison branch", () => {
  const start = { type: EventType.TOOL_CALL_START, toolCallId: "c1", toolCallName: "showComparisonTable" } as BaseEvent;
  const result = { type: EventType.TOOL_CALL_RESULT, toolCallId: "c1", content: JSON.stringify({ ok: true, rows }) } as BaseEvent;

  it("appends render_ui after the tool result", async () => {
    const events = await new Promise<BaseEvent[]>((resolve) => {
      of(start, result).pipe(emitRecommendationSurface(), toArray()).subscribe(resolve);
    });
    expect(events.map((event) => event.type)).toEqual([
      EventType.TOOL_CALL_START,
      EventType.TOOL_CALL_RESULT,
      EventType.TOOL_CALL_START,
      EventType.TOOL_CALL_ARGS,
      EventType.TOOL_CALL_END,
    ]);
  });

  it("does not render a failed comparison", async () => {
    const events = await new Promise<BaseEvent[]>((resolve) => {
      of(
        start,
        { ...result, content: JSON.stringify({ ok: false, rows: [] }) } as BaseEvent,
      ).pipe(emitRecommendationSurface(), toArray()).subscribe(resolve);
    });
    expect(events).toHaveLength(2);
  });
});
