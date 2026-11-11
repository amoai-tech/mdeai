import { describe, expect, it, vi, afterEach } from "vitest";
import { EMPTY, NEVER, of } from "rxjs";
import { EventType, type BaseEvent, type RunAgentInput } from "@ag-ui/client";
import { MastraAgent } from "@ag-ui/mastra";
import { LoggingMastraAgent, trimToNewestTurn } from "./logging-mastra-agent";

/**
 * SAN-1389 — the concierge must not save the on-screen history again.
 *
 * CopilotKit resends every on-screen message on each run; @ag-ui/mastra turns
 * them all into id-less Mastra messages, and Mastra saves them as new rows. Measured
 * on a preview: after a 2nd message, the 1st question and answer were stored again.
 * The concierge's context lives in Mastra thread memory (last 20 messages plus
 * working memory), so only the newest turn needs to be sent.
 */

const input = (messages: RunAgentInput["messages"]): RunAgentInput => ({
  threadId: "t",
  runId: "r",
  state: {},
  tools: [],
  context: [],
  forwardedProps: {},
  messages,
});

const u = (id: string, content: string) => ({ id, role: "user" as const, content });
const a = (id: string, content: string) => ({ id, role: "assistant" as const, content });

describe("trimToNewestTurn", () => {
  it("sends only the newest user message when history is on screen", () => {
    const out = trimToNewestTurn(input([u("1", "q1"), a("2", "a1"), u("3", "q2")]));
    expect(out.messages).toEqual([u("3", "q2")]);
  });

  it("leaves a first message alone", () => {
    const first = input([u("1", "q1")]);
    expect(trimToNewestTurn(first)).toBe(first);
  });

  it("leaves a tool-result resume run untouched (browser tool or approval answer)", () => {
    const resume = input([
      u("1", "show it on the map"),
      {
        id: "2",
        role: "assistant",
        content: "",
        toolCalls: [{ id: "tc", type: "function", function: { name: "focusMapPin", arguments: "{}" } }],
      },
      { id: "3", role: "tool", toolCallId: "tc", content: "Focused map on pin x" },
    ]);
    expect(trimToNewestTurn(resume)).toBe(resume);
  });

  it("leaves any run that does not end on a user message untouched, so context is never lost", () => {
    const endsOnAssistant = input([u("1", "q1"), a("2", "a1")]);
    expect(trimToNewestTurn(endsOnAssistant)).toBe(endsOnAssistant);
  });

  it("keeps the rest of the run input", () => {
    const out = trimToNewestTurn({ ...input([u("1", "q1"), a("2", "a1"), u("3", "q2")]), state: { k: 1 } });
    expect(out.state).toEqual({ k: 1 });
    expect(out.threadId).toBe("t");
  });
});

describe("LoggingMastraAgent.run — which agents get the trimmed input", () => {
  afterEach(() => vi.restoreAllMocks());

  const sent = (agentMapKey: string, messages: RunAgentInput["messages"]) => {
    const spy = vi.spyOn(MastraAgent.prototype, "run").mockReturnValue(EMPTY);
    const agent = new LoggingMastraAgent({
      agentId: agentMapKey,
      agentMapKey,
      agent: {} as never,
      resourceId: "user-1",
      persistTurnLog: () => undefined,
    });
    agent.run(input(messages)).subscribe();
    return (spy.mock.calls[0][0] as RunAgentInput).messages;
  };

  const history = [u("1", "q1"), a("2", "a1"), u("3", "q2")];

  it("concierge: newest turn only", () => {
    expect(sent("conciergeAgent", history)).toEqual([u("3", "q2")]);
  });

  it("host event agent: unchanged SAN-905 behaviour", () => {
    expect(sent("hostEventAgent", history)).toEqual([u("3", "q2")]);
  });

  it("host event agent keeps the current turn's tool call and result", () => {
    const toolCall = {
      id: "2",
      role: "assistant" as const,
      content: "",
      toolCalls: [{ id: "tc", type: "function" as const, function: { name: "set_event_draft", arguments: "{}" } }],
    };
    const toolResult = { id: "3", role: "tool" as const, toolCallId: "tc", content: "{\"ok\":true}" };
    const messages = [u("1", "old"), a("2", "old"), u("4", "create salsa"), toolCall, toolResult] as RunAgentInput["messages"];
    expect(sent("hostEventAgent", messages)).toEqual([u("4", "create salsa"), toolCall, toolResult]);
  });

  it("other agents: untouched", () => {
    expect(sent("hostOpsAgent", history)).toEqual(history);
  });

  it("concierge keeps the runtime-injected render_ui tool and the generative UI context", () => {
    // SAN-1653: the runtime adds `render_ui` and one context entry per run. The
    // concierge trims history; if that trim rebuilt the input instead of
    // spreading it, the agent would lose the tool and silently never render.
    const renderUi = {
      name: "render_ui",
      description: "Render or update generative UI surfaces",
      parameters: { type: "object", properties: {}, required: ["target", "operations"] },
    };
    const guide = {
      description: "Generative UI guide: available components, functions, targets, and how to call render_ui.",
      value: "targets: chat, rental-recommendations",
    };
    const spy = vi.spyOn(MastraAgent.prototype, "run").mockReturnValue(EMPTY);
    const agent = new LoggingMastraAgent({
      agentId: "conciergeAgent", agentMapKey: "conciergeAgent",
      agent: {} as never, resourceId: "user-1", persistTurnLog: () => undefined,
    });
    agent
      .run({
        ...input([u("1", "q1"), a("2", "a1"), u("3", "which apartments match?")]),
        tools: [renderUi as never],
        context: [guide],
      })
      .subscribe();
    const forwarded = spy.mock.calls[0][0] as RunAgentInput;
    expect(forwarded.messages).toEqual([u("3", "which apartments match?")]);
    expect(forwarded.tools?.map((tool) => tool.name)).toEqual(["render_ui"]);
    expect(forwarded.context).toEqual([guide]);
  });
});

describe("SAN-1588 full turn deadline", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("does not report a timeout after an early client unsubscribe", async () => {
    vi.useFakeTimers();
    vi.spyOn(MastraAgent.prototype, "run").mockReturnValue(NEVER);
    const persist = vi.fn();
    const agent = new LoggingMastraAgent({
      agentId: "conciergeAgent", agentMapKey: "conciergeAgent",
      agent: {} as never, resourceId: "user-1", persistTurnLog: persist,
    });
    const errors: unknown[] = [];
    const sub = agent.run(input([u("1", "find rentals")])).subscribe({error: (err) => errors.push(err)});
    sub.unsubscribe();
    await vi.advanceTimersByTimeAsync(26_001);
    expect(errors).toHaveLength(0);
    expect(persist).toHaveBeenCalledWith(expect.objectContaining({status:"error", errorType:"client_abort"}));
  });

  it("errors and persists timeout when the agent never emits an event", async () => {
    vi.useFakeTimers();
    vi.spyOn(MastraAgent.prototype, "run").mockReturnValue(NEVER);
    const persist = vi.fn();
    const agent = new LoggingMastraAgent({
      agentId: "conciergeAgent",
      agentMapKey: "conciergeAgent",
      agent: {} as never,
      resourceId: "user-1",
      persistTurnLog: persist,
    });
    const errors: unknown[] = [];
    agent.run(input([u("1", "find rentals")])).subscribe({ error: (error) => errors.push(error) });
    await vi.advanceTimersByTimeAsync(26_001);
    expect(errors).toHaveLength(1);
    expect(String(errors[0])).toMatch(/timed out/);
    expect(persist).toHaveBeenCalledWith(expect.objectContaining({status:"error", errorType:"timeout"}));
  });
});

describe("SAN-1074 AG-UI run outcome telemetry", () => {
  afterEach(() => vi.restoreAllMocks());

  it("records a RUN_ERROR event as a failed turn even when the stream completes normally", () => {
    const runError = {
      type: EventType.RUN_ERROR,
      message: "Gemini rate limit exceeded — sensitive model response text must not be persisted",
      code: "RATE_LIMIT",
    } as BaseEvent;
    vi.spyOn(MastraAgent.prototype, "run").mockReturnValue(of(runError));
    const persist = vi.fn();
    const agent = new LoggingMastraAgent({
      agentId: "conciergeAgent", agentMapKey: "conciergeAgent",
      agent: {} as never, resourceId: "user-1", persistTurnLog: persist,
    });
    const seen: BaseEvent[] = [];
    agent.run(input([u("u1", "Search rentals")])).subscribe({ next: (event) => seen.push(event) });
    expect(seen).toEqual([runError]);
    expect(persist).toHaveBeenCalledTimes(1);
    expect(persist).toHaveBeenCalledWith(expect.objectContaining({
      status: "error",
      errorType: "rate_limit",
      errorMessage: "AG-UI RUN_ERROR (RATE_LIMIT)",
      metadata: expect.objectContaining({ turn_status: "error", error_type: "rate_limit" }),
    }));
    expect(JSON.stringify(persist.mock.calls)).not.toContain("sensitive model response text");
  });

  it("classifies terminal AG-UI timeout without a thrown exception", () => {
    const runError = {
      type: EventType.RUN_ERROR,
      message: "Upstream call stopped; private request details should remain private",
      code: "TIMEOUT",
    } as BaseEvent;
    vi.spyOn(MastraAgent.prototype, "run").mockReturnValue(of(runError));
    const persist = vi.fn();
    const agent = new LoggingMastraAgent({
      agentId: "conciergeAgent", agentMapKey: "conciergeAgent",
      agent: {} as never, resourceId: "user-1", persistTurnLog: persist,
    });
    agent.run(input([u("u1", "Search rentals")])).subscribe();
    expect(persist).toHaveBeenCalledWith(expect.objectContaining({
      status: "error",
      errorType: "timeout",
      errorMessage: "AG-UI RUN_ERROR (TIMEOUT)",
    }));
    expect(JSON.stringify(persist.mock.calls)).not.toContain("private request details");
  });

  it("prefers the authoritative RATE_LIMIT code over a misleading cancellation message", () => {
    vi.spyOn(MastraAgent.prototype, "run").mockReturnValue(of({
      type: EventType.RUN_ERROR,
      code: "RATE_LIMIT",
      message: "The upstream request was cancelled during a throttling response",
    } as BaseEvent));
    const persist = vi.fn();
    const agent = new LoggingMastraAgent({
      agentId: "conciergeAgent", agentMapKey: "conciergeAgent",
      agent: {} as never, resourceId: "user-1", persistTurnLog: persist,
    });
    agent.run(input([u("u1", "Search rentals")])).subscribe();
    expect(persist).toHaveBeenCalledWith(expect.objectContaining({
      status: "error",
      errorType: "rate_limit",
      errorMessage: "AG-UI RUN_ERROR (RATE_LIMIT)",
    }));
  });

  it("records a normal RUN_FINISHED stream as success", () => {
    vi.spyOn(MastraAgent.prototype, "run").mockReturnValue(of({
      type: EventType.RUN_FINISHED, threadId: "t", runId: "r",
    } as BaseEvent));
    const persist = vi.fn();
    const agent = new LoggingMastraAgent({
      agentId: "conciergeAgent", agentMapKey: "conciergeAgent",
      agent: {} as never, resourceId: "user-1", persistTurnLog: persist,
    });
    agent.run(input([u("u1", "Search rentals")])).subscribe();
    expect(persist).toHaveBeenCalledWith(expect.objectContaining({ status: "success" }));
  });
});
