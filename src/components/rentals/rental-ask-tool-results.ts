"use client";

import { useEffect, useMemo, useState } from "react";
import type { AbstractAgent } from "@copilotkit/react-core/v2";
import type { Rental } from "@/mastra/tools/search-rentals";
import type { RentalAskResults } from "@/components/rentals/rental-ask-composer";
import { toDetailRental } from "@/lib/rentals/chat-rental-detail";
import { unappliedRentalNotice, unappliedRentalRequests } from "@/lib/rental-display";

/**
 * Reading the agent's rental search out of the thread.
 *
 * Kept beside the composer rather than inside it: the parsing rules (two message shapes, a call
 * name that lives on a different message than its result) are the part most likely to drift, and
 * they are easier to reason about on their own.
 */

export type PlainTurn = { id: string; role: "user" | "assistant"; text: string };
export type AgentMessage = {
  id?: string;
  role?: string;
  content?: unknown;
  toolName?: string;
  toolCallId?: string;
  toolCalls?: unknown;
};

const RENTAL_TOOL = /search[-_]?rentals/i;

/** Message text across the shapes the thread stores (plain string, or parts with text). */
function messageText(message: AgentMessage | undefined): string {
  const content = message?.content;
  if (typeof content === "string") {
    try {
      const parsed = JSON.parse(content) as { content?: string; parts?: Array<{ type?: string; text?: string }> };
      const text = parsed.parts?.find((part) => part.type === "text")?.text ?? parsed.content;
      if (typeof text === "string") return text;
    } catch {
      return content;
    }
    return "";
  }
  if (content && typeof content === "object") {
    const parsed = content as { content?: string; parts?: Array<{ type?: string; text?: string }> };
    return parsed.parts?.find((part) => part.type === "text")?.text ?? parsed.content ?? "";
  }
  return "";
}

type ToolCallLike = { id?: string; function?: { name?: string } };

/** True when a parsed tool result looks like rental rows, for results whose call name is lost. */
function looksLikeRentalRows(results: unknown[]): boolean {
  const first = results[0] as { nightly_price?: unknown; price_monthly?: unknown; bedrooms?: unknown } | undefined;
  return Boolean(first && ("nightly_price" in first || "price_monthly" in first || "bedrooms" in first));
}

/**
 * The agent's own rental search result: the single source of truth for the cards.
 *
 * The client keeps the result on a `role: "tool"` message (toolCallId + JSON content) and the
 * tool's name on the preceding assistant message's `toolCalls`. The result carries no total, so
 * the honest count is the rows it returned — the same rows the answer was written from.
 */
function latestRentalToolResult(
  messages: readonly AgentMessage[],
): { signature: string; payload: RentalAskResults } | null {
  const callNames = new Map<string, string>();
  for (const message of messages) {
    if (message.role !== "assistant" || !Array.isArray(message.toolCalls)) continue;
    for (const call of message.toolCalls as ToolCallLike[]) {
      if (call?.id && call.function?.name) callNames.set(call.id, call.function.name);
    }
  }

  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message?.role !== "tool") continue;
    let data: unknown = message.content;
    if (typeof data === "string") {
      try {
        data = JSON.parse(data);
      } catch {
        continue;
      }
    }
    const envelope = data as {
      results?: unknown;
      budgetNote?: unknown;
      unappliedRequests?: unknown;
    } | null;
    if (!envelope || !Array.isArray(envelope.results) || envelope.results.length === 0) continue;
    const toolName = callNames.get(message.toolCallId ?? "") ?? "";
    if (toolName ? !RENTAL_TOOL.test(toolName) : !looksLikeRentalRows(envelope.results)) continue;
    // The tool validated its output server-side, but this is still a trust boundary in the browser:
    // one malformed row must not become a card, a price or a pin.
    const rows = envelope.results.map((row) => toDetailRental(row));
    if (rows.some((row) => row === null)) continue;
    const resultRows = rows as Rental[];
    const question = [...messages.slice(0, index)]
      .reverse()
      .find((candidate) => candidate.role === "user");
    const questionText = messageText(question);
    // The tool can only disclose requests that reached it in `queryText`; the renter's own words
    // are the reliable source, so the page names them even when the agent omitted that argument.
    const unapplied = [
      ...new Set([
        ...(Array.isArray(envelope.unappliedRequests)
          ? envelope.unappliedRequests.filter((label): label is string => typeof label === "string")
          : []),
        ...unappliedRentalRequests(questionText),
      ]),
    ];
    const notices = [
      typeof envelope.budgetNote === "string" ? envelope.budgetNote : undefined,
      unappliedRentalNotice(unapplied),
    ].filter((notice): notice is string => Boolean(notice));
    return {
      signature: `${message.toolCallId ?? index}:${resultRows.length}:${resultRows[0]?.id ?? ""}`,
      payload: {
        results: resultRows,
        total: resultRows.length,
        query: questionText,
        budgetNotice: notices.length ? notices.join(" ") : undefined,
      },
    };
  }
  return null;
}

export const payloadRows = (payload: RentalAskResults) =>
  payload.results.map((r) => ({
    id: r.id,
    title: r.title,
    neighborhood: r.neighborhood,
    nightly_price: r.nightly_price,
    // Verbatim from the listing; empty stays empty so the answer can say "not specified".
    amenities: Array.isArray(r.amenities) ? r.amenities : undefined,
  }));

/** Keep only turns that have text, so tool/state-only messages do not leave blank rows. */
const TRANSCRIPT_LIMIT = 6;

function plainTurns(messages: readonly AgentMessage[]): PlainTurn[] {
  const turns: PlainTurn[] = [];
  messages.forEach((message, index) => {
    if (message.role !== "user" && message.role !== "assistant") return;
    const text = messageText(message).trim();
    if (!text) return;
    turns.push({ id: message.id ?? `${message.role}-${index}`, role: message.role, text });
  });
  return turns.slice(-TRANSCRIPT_LIMIT);
}

/** Copied messages, subscribed, so streaming and in-place mutations reach the transcript. */
export function useTurns(agent: AbstractAgent | undefined): PlainTurn[] {
  const [snapshot, setSnapshot] = useState<{ agent: AbstractAgent | undefined; messages: readonly AgentMessage[] }>(
    () => ({ agent, messages: agent ? [...(agent.messages as unknown as AgentMessage[])] : [] }),
  );

  if (snapshot.agent !== agent) {
    setSnapshot({
      agent,
      messages: agent ? [...(agent.messages as unknown as AgentMessage[])].slice(-12) : [],
    });
  }

  useEffect(() => {
    if (!agent) return;
    const copy = () =>
      setSnapshot({ agent, messages: [...(agent.messages as unknown as AgentMessage[])].slice(-12) });
    const subscription = agent.subscribe({ onMessagesChanged: copy });
    return () => subscription.unsubscribe();
  }, [agent]);

  return useMemo(() => plainTurns(snapshot.messages), [snapshot.messages]);
}

/** Applies each new rental tool result once, as the agent streams it in. */
export function useRentalToolResults(
  agent: AbstractAgent | undefined,
  onResult: (payload: RentalAskResults, signature: string) => void,
): void {
  useEffect(() => {
    if (!agent) return;
    let seen = "";
    const read = () => {
      const found = latestRentalToolResult(agent.messages as unknown as AgentMessage[]);
      if (!found || found.signature === seen) return;
      seen = found.signature;
      onResult(found.payload, found.signature);
    };
    const subscription = agent.subscribe({ onMessagesChanged: read });
    return () => subscription.unsubscribe();
  }, [agent, onResult]);
}

