import { describe, expect, it } from "vitest";
import { EventType, type BaseEvent } from "@ag-ui/client";
import { of, toArray } from "rxjs";
import { normalizeRenderUiArgs, normalizeRenderUiToolArgs } from "../normalize-render-ui-args";

const createSurface = (id: string) => ({ createSurface: { surfaceId: id, components: [] } });

describe("normalizeRenderUiArgs", () => {
  it("adds the missing version to operation bodies", () => {
    const out = normalizeRenderUiArgs(JSON.stringify({ target: "chat", operations: [createSurface("s1")] }));
    expect(out).not.toBeNull();
    expect(JSON.parse(out as string).operations[0]).toMatchObject({ version: "1.0", createSurface: { surfaceId: "s1" } });
  });

  it("leaves an already-versioned operation untouched", () => {
    const args = JSON.stringify({ target: "chat", operations: [{ version: "1.0", ...createSurface("s1") }] });
    expect(normalizeRenderUiArgs(args)).toBeNull();
  });

  it("hoists a top-level version when the model put it there", () => {
    const out = normalizeRenderUiArgs(JSON.stringify({ version: "1.0", operations: [createSurface("s1")] }));
    expect(JSON.parse(out as string).operations[0].version).toBe("1.0");
  });

  it("never rewrites an unknown operation shape", () => {
    expect(normalizeRenderUiArgs(JSON.stringify({ operations: [{ nonsense: true }] }))).toBeNull();
  });

  it("clamps an oversized Table to 5 rows by 4 columns", () => {
    const table = {
      id: "t",
      component: "Table",
      columns: ["A", "B", "C", "D", "E"],
      rows: Array.from({ length: 7 }, () => ["a", "b", "c", "d", "e"]),
    };
    const args = JSON.stringify({
      target: "chat",
      operations: [{ version: "1.0", createSurface: { surfaceId: "s1", components: [table] } }],
    });
    const out = normalizeRenderUiArgs(args);
    expect(out).not.toBeNull();
    const node = JSON.parse(out as string).operations[0].createSurface.components[0];
    expect(node.columns).toHaveLength(4);
    expect(node.rows).toHaveLength(5);
    expect(node.rows[0]).toHaveLength(4);
  });

  it("leaves a Table within the cap untouched", () => {
    const table = { id: "t", component: "Table", columns: ["A", "B"], rows: [["a", "b"]] };
    const args = JSON.stringify({
      target: "chat",
      operations: [{ version: "1.0", createSurface: { surfaceId: "s1", components: [table] } }],
    });
    expect(normalizeRenderUiArgs(args)).toBeNull();
  });

  it("passes malformed or non-render arguments through", () => {
    expect(normalizeRenderUiArgs("not json")).toBeNull();
    expect(normalizeRenderUiArgs("")).toBeNull();
    expect(normalizeRenderUiArgs(JSON.stringify({ target: "chat" }))).toBeNull();
  });
});

describe("normalizeRenderUiToolArgs", () => {
  const start = (id: string, name = "render_ui") => ({ type: EventType.TOOL_CALL_START, toolCallId: id, toolCallName: name }) as BaseEvent;
  const chunk = (id: string, delta: string) => ({ type: EventType.TOOL_CALL_ARGS, toolCallId: id, delta }) as BaseEvent;
  const end = (id: string) => ({ type: EventType.TOOL_CALL_END, toolCallId: id }) as BaseEvent;

  it("holds render_ui deltas and emits one normalised delta before the end", async () => {
    const json = JSON.stringify({ target: "chat", operations: [createSurface("s1")] });
    const events = await new Promise<BaseEvent[]>((resolve) => {
      of(start("c1"), chunk("c1", json.slice(0, 10)), chunk("c1", json.slice(10)), end("c1"))
        .pipe(normalizeRenderUiToolArgs(), toArray())
        .subscribe(resolve);
    });
    const args = events.filter((e) => e.type === EventType.TOOL_CALL_ARGS) as unknown as Array<{ delta: string }>;
    expect(args).toHaveLength(1);
    expect(JSON.parse(args[0].delta).operations[0].version).toBe("1.0");
    expect(events.at(-1)?.type).toBe(EventType.TOOL_CALL_END);
  });

  it("streams other tools untouched", async () => {
    const events = await new Promise<BaseEvent[]>((resolve) => {
      of(start("c2", "search_rentals"), chunk("c2", "{\"a\":1}"), end("c2"))
        .pipe(normalizeRenderUiToolArgs(), toArray())
        .subscribe(resolve);
    });
    expect(events.filter((e) => e.type === EventType.TOOL_CALL_ARGS)).toHaveLength(1);
  });
});
