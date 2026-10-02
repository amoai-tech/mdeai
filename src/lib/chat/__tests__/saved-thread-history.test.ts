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

  it("does not show a tool result twice when the live side uses another id for it", () => {
    const persisted = [
      p("1", "user", "laureles"),
      {
        id: "2",
        role: "assistant" as const,
        content: "",
        toolCalls: [{ id: "tc1", type: "function" as const, function: { name: "searchRentalsTool", arguments: "{}" } }],
      },
      { id: "2:tc1", role: "tool" as const, toolCallId: "tc1", content: "{}" },
    ];
    const live = [
      { id: "x1", role: "user", content: "laureles" },
      { id: "x2", role: "assistant", content: "", toolCalls: [{ id: "tc1", type: "function", function: { name: "searchRentalsTool", arguments: "{}" } }] },
      { id: "x3", role: "tool", toolCallId: "tc1", content: "{}" },
    ];
    expect(reconcileSavedHistory(persisted, live)).toEqual(persisted);
  });

  it("keeps a live tool result the durable history does not have", () => {
    const persisted = [p("1", "user", "a")];
    const extra = { id: "t9", role: "tool", toolCallId: "new-call", content: "{}" };
    expect(reconcileSavedHistory(persisted, [extra])).toEqual([persisted[0], extra]);
  });

  it("a replay of an old 'yes' is dropped, but a genuinely newer 'yes' is kept", () => {
    const persisted = [p("1", "user", "yes")];
    const replay = { id: "x1", role: "user", content: "yes" }; // CopilotKit's copy of the old one
    const newer = { id: "x2", role: "user", content: "yes" }; // arrived after the history was read
    expect(reconcileSavedHistory(persisted, [replay, newer])).toEqual([persisted[0], newer]);
  });

  it("a persisted message already matched by id does not also swallow a newer repeat", () => {
    const persisted = [p("1", "user", "yes")];
    const sameId = { id: "1", role: "user", content: "yes" };
    const newer = { id: "x2", role: "user", content: "yes" };
    expect(reconcileSavedHistory(persisted, [sameId, newer])).toEqual([persisted[0], newer]);
  });

  it("an empty live view returns exactly the durable history", () => {
    const persisted = [p("1", "user", "a")];
    expect(reconcileSavedHistory(persisted, [])).toEqual(persisted);
  });
});

describe("mapSavedThreadHistory — repeats already saved before the fix", () => {
  // Measured on a pre-fix preview: re-saved copies were written 1-3 ms apart; a
  // genuine question and its answer were 1.6-1.9 s apart.
  const t0 = Date.UTC(2026, 9, 1, 12, 0, 0);
  const r = (id: string, role: string, t: string, ms: number) =>
    row(id, role, text(t), new Date(t0 + ms).toISOString());
  const shown = (rows: SavedThreadMessageRow[]) =>
    mapSavedThreadHistory(rows).map((m) => `${m.role}:${"content" in m ? m.content : ""}`);

  it("2-message chat saved as q1 a1 q1 a1 q2 a2 shows each message once", () => {
    expect(
      shown([
        r("1", "user", "q1", 0),
        r("2", "assistant", "a1", 1_900),
        // turn 2: the earlier turn is re-saved in one batch, then the new question
        r("3", "user", "q1", 5_000),
        r("4", "assistant", "a1", 5_001),
        r("5", "user", "q2", 5_002),
        r("6", "assistant", "a2", 7_000),
      ]),
    ).toEqual(["user:q1", "assistant:a1", "user:q2", "assistant:a2"]);
  });

  it("3-message chat with the whole history re-saved at every turn shows each message once", () => {
    expect(
      shown([
        r("1", "user", "q1", 0), r("2", "assistant", "a1", 1_900),
        r("3", "user", "q1", 5_000), r("4", "assistant", "a1", 5_001), r("5", "user", "q2", 5_002), r("6", "assistant", "a2", 7_000),
        r("7", "user", "q1", 12_000), r("8", "assistant", "a1", 12_001), r("9", "user", "q2", 12_002), r("10", "assistant", "a2", 12_003),
        r("11", "user", "q3", 12_004), r("12", "assistant", "a3", 14_000),
      ]),
    ).toEqual(["user:q1", "assistant:a1", "user:q2", "assistant:a2", "user:q3", "assistant:a3"]);
  });

  it("a person who genuinely repeats themselves is not collapsed", () => {
    expect(
      shown([
        r("1", "user", "ok", 0),
        r("2", "assistant", "first answer", 1_800),
        r("3", "user", "ok", 9_000),
        r("4", "assistant", "second answer", 10_800),
      ]),
    ).toEqual(["user:ok", "assistant:first answer", "user:ok", "assistant:second answer"]);
  });

  it("the same question asked twice with the same answer both times is kept (seconds apart)", () => {
    expect(
      shown([
        r("1", "user", "What time is it?", 0),
        r("2", "assistant", "3pm", 1_700),
        r("3", "user", "What time is it?", 30_000),
        r("4", "assistant", "3pm", 31_600),
      ]),
    ).toEqual(["user:What time is it?", "assistant:3pm", "user:What time is it?", "assistant:3pm"]);
  });

  it("an unreadable write time keeps the message rather than hiding it", () => {
    const out = mapSavedThreadHistory([
      { id: "1", role: "user", content: JSON.stringify(text("q")), createdAt: "not a date" },
      { id: "2", role: "assistant", content: JSON.stringify(text("a")), createdAt: "not a date" },
      { id: "3", role: "user", content: JSON.stringify(text("q")), createdAt: "not a date" },
      { id: "4", role: "assistant", content: JSON.stringify(text("a")), createdAt: "not a date" },
    ]);
    expect(out).toHaveLength(4);
  });

  it("a repeated tool turn drops its tool result with it, leaving none orphaned", () => {
    const call = (id: string, tc: string, ms: number) =>
      row(id, "assistant", {
        format: 2,
        parts: [
          { type: "tool-invocation", toolInvocation: { state: "result", toolCallId: tc, toolName: "searchRentalsTool", args: { q: "x" }, result: { items: [1] } } },
          { type: "text", text: "Found one." },
        ],
      }, new Date(t0 + ms).toISOString());
    const out = mapSavedThreadHistory([
      r("1", "user", "laureles", 0), call("2", "tc1", 1_900),
      r("3", "user", "laureles", 5_000), call("4", "tc1", 5_001),
      r("5", "user", "parking?", 5_002), r("6", "assistant", "yes", 7_000),
    ]);
    expect(out.filter((m) => m.role === "tool")).toHaveLength(1);
    expect(out.map((m) => m.role)).toEqual(["user", "assistant", "tool", "user", "assistant"]);
  });
});
