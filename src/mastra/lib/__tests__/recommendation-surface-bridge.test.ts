import { describe, expect, it } from "vitest";
import { EventType, type BaseEvent } from "@ag-ui/client";
import { of, toArray } from "rxjs";
import {
  emitRecommendationSurface,
  filterControlOk,
  filterControlRenderEvents,
  recommendationIdsFromResult,
  renderUiEventsFor,
  eventIdsFromResult,
  renderEventUiEventsFor,
} from "../recommendation-surface-bridge";
import { buildEventRecommendationOps } from "../event-recommendations-ui";

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

describe("SAN-1655 filter control surface", () => {
  const startEvent = (id: string, name: string) => ({ type: EventType.TOOL_CALL_START, toolCallId: id, toolCallName: name }) as BaseEvent;
  const resultEvent = (id: string, content: unknown) => ({ type: EventType.TOOL_CALL_RESULT, toolCallId: id, content }) as BaseEvent;
  it("emits one valid render_ui with the server-built control ops", () => {
    const events = filterControlRenderEvents("tc-1");
    expect(events).toHaveLength(3);
    const args = JSON.parse((events[1] as unknown as { delta: string }).delta) as {
      target: string; operations: Array<{ version: string; createSurface: { components: Array<{ component: string }> } }>;
    };
    expect(args.target).toBe("rental-recommendations");
    expect(args.operations[0].version).toBe("1.0");
    expect(args.operations[0].createSurface.components.map((c) => c.component)).toEqual([
      "Column", "BedroomFilter", "ApplyFiltersButton",
    ]);
  });

  it("refuses to render a rejected control result", async () => {
    const events = await new Promise<BaseEvent[]>((resolve) => {
      of(startEvent("f2", "showRentalFilterControl"), resultEvent("f2", JSON.stringify({ ok: false, message: "not the rentals page" })))
        .pipe(emitRecommendationSurface(), toArray())
        .subscribe(resolve);
    });
    const renders = events.filter(
      (e) => e.type === EventType.TOOL_CALL_START && (e as { toolCallName?: string }).toolCallName === "render_ui",
    );
    expect(renders).toHaveLength(0);
    expect(filterControlOk({ ok: false })).toBe(false);
    expect(filterControlOk({ ok: true })).toBe(true);
    expect(filterControlOk("not json")).toBe(false);
  });

  it("renders the control instead of cards for its tool result", async () => {
    const events = await new Promise<BaseEvent[]>((resolve) => {
      of(startEvent("f1", "showRentalFilterControl"), resultEvent("f1", JSON.stringify({ ok: true })))
        .pipe(emitRecommendationSurface(), toArray())
        .subscribe(resolve);
    });
    const renders = events.filter(
      (e) => e.type === EventType.TOOL_CALL_START && (e as { toolCallName?: string }).toolCallName === "render_ui",
    );
    expect(renders).toHaveLength(1);
    expect(events.some((e) => e.type === EventType.TOOL_CALL_START && (e as { toolCallName?: string }).toolCallName === "render_ui")).toBe(true);
  });
});

describe("event recommendations (SAN-1653)", () => {
  const eventId = (n: number) => `evt-0000-0000-0000-0000${String(n).padStart(4, "0")}`;
  const startEvent = (id: string, name: string) =>
    ({ type: EventType.TOOL_CALL_START, toolCallId: id, toolCallName: name }) as BaseEvent;
  const resultEvent = (id: string, content: unknown) =>
    ({ type: EventType.TOOL_CALL_RESULT, toolCallId: id, content }) as BaseEvent;

  it("reads only concrete ids from a searchEvents result", () => {
    expect(
      eventIdsFromResult({
        results: [{ id: eventId(1), title: "Reina" }, { id: eventId(2) }],
        total: 2,
      }),
    ).toEqual([eventId(1), eventId(2)]);
    expect(eventIdsFromResult({ results: [] })).toEqual([]);
    expect(eventIdsFromResult("not json")).toEqual([]);
    expect(eventIdsFromResult({ results: [{ title: "no id" }] })).toEqual([]);
  });

  it("builds one EventCard per id on the event-recommendations target", () => {
    const built = buildEventRecommendationOps([eventId(1), eventId(2)], "surface-1");
    expect(built?.target).toBe("event-recommendations");
    const surface = (built?.operations[0] as { createSurface: { components: Array<Record<string, unknown>> } })
      .createSurface;
    expect(surface.components.filter((c) => c.component === "EventCard")).toHaveLength(2);
    expect(surface.components).toContainEqual({ id: "card-1", component: "EventCard", eventId: eventId(1) });
  });

  it("emits one synthetic render_ui call for a searchEvents result", async () => {
    const events = await new Promise<BaseEvent[]>((resolve) => {
      of(
        startEvent("e1", "searchEvents"),
        resultEvent("e1", JSON.stringify({ results: [{ id: eventId(3) }], total: 1 })),
      )
        .pipe(emitRecommendationSurface(), toArray())
        .subscribe(resolve);
    });
    const start = events.find(
      (e) => e.type === EventType.TOOL_CALL_START && (e as { toolCallName?: string }).toolCallName === "render_ui",
    ) as { toolCallId?: string } | undefined;
    expect(start?.toolCallId).toBe("render-ui-event-e1");
    const args = events.find(
      (e) => e.type === EventType.TOOL_CALL_ARGS && (e as { toolCallId?: string }).toolCallId === "render-ui-event-e1",
    ) as { delta?: string } | undefined;
    expect(args?.delta).toContain("event-recommendations");
    expect(args?.delta).toContain(eventId(3));
    expect(renderEventUiEventsFor([], "e1")).toBeNull();
    // Path traversal / script characters never reach the surface operation.
    const built = buildEventRecommendationOps(
      ["evt-1<script>alert(1)</script>", "../../etc/passwd", eventId(4)],
      "surface-2",
    );
    const surface = (built?.operations[0] as {
      createSurface: { components: Array<Record<string, unknown>> };
    }).createSurface;
    expect(surface.components.filter((c) => c.component === "EventCard")).toEqual([
      { id: "card-1", component: "EventCard", eventId: eventId(4) },
    ]);
  });
});
