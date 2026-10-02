import { describe, expect, it, vi, afterEach } from "vitest";
import { EMPTY } from "rxjs";
import type { RunAgentInput } from "@ag-ui/client";
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

  it("other agents: untouched", () => {
    expect(sent("hostOpsAgent", history)).toEqual(history);
  });
});
