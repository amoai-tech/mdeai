import { describe, expect, it } from "vitest";
import {
  SAVED_THREAD_HISTORY_LIMIT,
  mapSavedThreadHistory,
  type SavedThreadMessageRow,
} from "@/lib/chat/saved-thread-history";

const row = (
  id: string,
  role: string,
  content: unknown,
  createdAt = "2026-10-01T10:00:00.000Z",
): SavedThreadMessageRow => ({
  id,
  role,
  createdAt,
  content: typeof content === "string" ? content : JSON.stringify(content),
});
const text = (t: string) => ({ format: 2, parts: [{ type: "text", text: t }] });

describe("mapSavedThreadHistory", () => {
  it("maps user text and assistant structured text", () => {
    const out = mapSavedThreadHistory([
      row("u1", "user", text("1BR in Laureles"), "2026-10-01T10:00:00.000Z"),
      row(
        "a1",
        "assistant",
        { format: 2, parts: [{ type: "step-start" }, { type: "text", text: "Here " }, { type: "text", text: "you go" }] },
        "2026-10-01T10:00:01.000Z",
      ),
    ]);
    expect(out).toEqual([
      { id: "u1", role: "user", content: "1BR in Laureles" },
      { id: "a1", role: "assistant", content: "Here you go" },
    ]);
  });

  it("keeps a completed tool call and its result so tool cards still render", () => {
    const out = mapSavedThreadHistory([
      row("a1", "assistant", {
        format: 2,
        parts: [
          {
            type: "tool-invocation",
            toolInvocation: {
              state: "result",
              toolCallId: "tc1",
              toolName: "searchRentals",
              args: { q: "laureles" },
              result: { items: [1] },
            },
          },
          { type: "text", text: "Found one." },
        ],
      }),
    ]);
    expect(out).toEqual([
      {
        id: "a1",
        role: "assistant",
        content: "Found one.",
        toolCalls: [
          { id: "tc1", type: "function", function: { name: "searchRentals", arguments: '{"q":"laureles"}' } },
        ],
      },
      { id: "a1:tc1", role: "tool", toolCallId: "tc1", content: '{"items":[1]}' },
    ]);
  });

  it("drops an unfinished tool call (no result to pair with)", () => {
    const out = mapSavedThreadHistory([
      row("a1", "assistant", {
        format: 2,
        parts: [{ type: "tool-invocation", toolInvocation: { state: "call", toolCallId: "t", toolName: "x", args: {} } }],
      }),
    ]);
    expect(out).toEqual([]);
  });

  it("falls back to the flat content string of older rows", () => {
    expect(mapSavedThreadHistory([row("u1", "user", { format: 2, parts: [], content: "hola" })])).toEqual([
      { id: "u1", role: "user", content: "hola" },
    ]);
  });

  it("skips malformed, empty, system and id-less rows without failing the rest", () => {
    const out = mapSavedThreadHistory([
      row("bad", "user", "{not json"),
      row("empty", "assistant", { format: 2, parts: [] }),
      row("sys", "system", text("secret instructions")),
      { id: undefined, role: "user", content: JSON.stringify(text("x")), createdAt: "2026-10-01T10:00:00.000Z" },
      row("ok", "user", text("still here"), "2026-10-01T10:00:05.000Z"),
    ]);
    expect(out).toEqual([{ id: "ok", role: "user", content: "still here" }]);
  });

  it("returns oldest → newest regardless of input order, ties broken by id", () => {
    const out = mapSavedThreadHistory([
      row("c", "user", text("3"), "2026-10-01T10:00:02.000Z"),
      row("b", "user", text("2"), "2026-10-01T10:00:01.000Z"),
      row("a2", "user", text("1b"), "2026-10-01T10:00:00.000Z"),
      row("a1", "user", text("1a"), "2026-10-01T10:00:00.000Z"),
    ]);
    expect(out.map((m) => m.id)).toEqual(["a1", "a2", "b", "c"]);
  });

  it("keeps only the newest 100 messages, still oldest first", () => {
    const rows = Array.from({ length: 130 }, (_, i) =>
      row(`m${String(i).padStart(3, "0")}`, "user", text(`#${i}`), new Date(Date.UTC(2026, 9, 1, 0, 0, i)).toISOString()),
    );
    const out = mapSavedThreadHistory(rows);
    expect(out).toHaveLength(SAVED_THREAD_HISTORY_LIMIT);
    expect(out[0].id).toBe("m030");
    expect(out.at(-1)?.id).toBe("m129");
  });

  it("never emits the same id twice", () => {
    const out = mapSavedThreadHistory([row("x", "user", text("a")), row("x", "user", text("a"))]);
    expect(out).toHaveLength(1);
  });
});
