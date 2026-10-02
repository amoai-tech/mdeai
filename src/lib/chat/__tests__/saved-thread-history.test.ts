import { describe, expect, it } from "vitest";
import {
  SAVED_THREAD_HISTORY_LIMIT,
  mapSavedThreadHistory,
  reconcileSavedHistory,
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

  it("a real stored assistant row: keeps text and the tool result, ignores MDE data-* parts", () => {
    const out = mapSavedThreadHistory([
      row("a1", "assistant", {
        format: 2,
        parts: [
          { type: "step-start" },
          {
            type: "tool-invocation",
            toolInvocation: { state: "result", toolCallId: "tc9", toolName: "searchEventsTool", args: {}, result: { events: [] } },
          },
          { type: "data-mdeai-actions", data: { kind: "event_results", cards: [{ id: "e1" }] } },
          { type: "data-workspace-metadata", data: { sessionId: "s1" } },
          { type: "text", text: "Two salsa nights this weekend." },
        ],
      }),
    ]);
    expect(out).toHaveLength(2);
    expect(out[0]).toMatchObject({ role: "assistant", content: "Two salsa nights this weekend." });
    expect(JSON.stringify(out)).not.toContain("event_results");
    expect(JSON.stringify(out)).not.toContain("sessionId");
    expect(out[1]).toMatchObject({ role: "tool", toolCallId: "tc9" });
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

describe("reconcileSavedHistory", () => {
  const p = (id: string, role: "user" | "assistant", content: string) => ({ id, role, content });

  it("durable history is the base; a partial live replay adds nothing", () => {
    const persisted = [p("1", "user", "a"), p("2", "assistant", "b"), p("3", "user", "c")];
    expect(reconcileSavedHistory(persisted, [persisted[2]])).toEqual(persisted);
  });

  it("drops a live copy of the same turn that arrived under another id", () => {
    const persisted = [p("1", "user", "a"), p("2", "assistant", "b")];
    const live = [p("x", "user", "a"), p("y", "assistant", "b")];
    expect(reconcileSavedHistory(persisted, live)).toEqual(persisted);
  });

  it("keeps a live message the durable history does not have, after it", () => {
    const persisted = [p("1", "user", "a")];
    const extra = p("n", "assistant", "late reply");
    expect(reconcileSavedHistory(persisted, [p("x", "user", "a"), extra])).toEqual([persisted[0], extra]);
  });

  it("an empty live view returns exactly the durable history", () => {
    const persisted = [p("1", "user", "a")];
    expect(reconcileSavedHistory(persisted, [])).toEqual(persisted);
  });
});

describe("mapSavedThreadHistory — repeats already saved before the fix", () => {
  const at = (n: number) => new Date(Date.UTC(2026, 9, 1, 0, 0, n)).toISOString();
  const r = (id: string, role: string, t: string, n: number) => row(id, role, text(t), at(n));
  const shown = (rows: SavedThreadMessageRow[]) =>
    mapSavedThreadHistory(rows).map((m) => `${m.role}:${"content" in m ? m.content : ""}`);

  it("2-message chat saved as q1 a1 q1 a1 q2 a2 shows each message once", () => {
    expect(
      shown([
        r("1", "user", "q1", 1),
        r("2", "assistant", "a1", 2),
        r("3", "user", "q1", 3),
        r("4", "assistant", "a1", 4),
        r("5", "user", "q2", 5),
        r("6", "assistant", "a2", 6),
      ]),
    ).toEqual(["user:q1", "assistant:a1", "user:q2", "assistant:a2"]);
  });

  it("3-message chat with the whole history re-saved at every turn shows each message once", () => {
    expect(
      shown([
        r("1", "user", "q1", 1), r("2", "assistant", "a1", 2),
        r("3", "user", "q1", 3), r("4", "assistant", "a1", 4), r("5", "user", "q2", 5), r("6", "assistant", "a2", 6),
        r("7", "user", "q1", 7), r("8", "assistant", "a1", 8), r("9", "user", "q2", 9), r("10", "assistant", "a2", 10),
        r("11", "user", "q3", 11), r("12", "assistant", "a3", 12),
      ]),
    ).toEqual(["user:q1", "assistant:a1", "user:q2", "assistant:a2", "user:q3", "assistant:a3"]);
  });

  it("a person who genuinely repeats themselves is not collapsed", () => {
    expect(
      shown([
        r("1", "user", "ok", 1),
        r("2", "assistant", "first answer", 2),
        r("3", "user", "ok", 3),
        r("4", "assistant", "second answer", 4),
      ]),
    ).toEqual(["user:ok", "assistant:first answer", "user:ok", "assistant:second answer"]);
  });

  it("a repeated tool turn drops its tool result with it, leaving none orphaned", () => {
    const call = (id: string, tc: string, n: number) =>
      row(id, "assistant", {
        format: 2,
        parts: [
          { type: "tool-invocation", toolInvocation: { state: "result", toolCallId: tc, toolName: "searchRentalsTool", args: { q: "x" }, result: { items: [1] } } },
          { type: "text", text: "Found one." },
        ],
      }, at(n));
    const out = mapSavedThreadHistory([
      r("1", "user", "laureles", 1), call("2", "tc1", 2),
      r("3", "user", "laureles", 3), call("4", "tc1", 4),
      r("5", "user", "parking?", 5), r("6", "assistant", "yes", 6),
    ]);
    expect(out.filter((m) => m.role === "tool")).toHaveLength(1);
    expect(out.map((m) => m.role)).toEqual(["user", "assistant", "tool", "user", "assistant"]);
  });
});
