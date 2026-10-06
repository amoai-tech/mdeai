// @vitest-environment jsdom
/**
 * SAN-966 — the latest-turn results live inside the CopilotKit transcript.
 *
 * Two contracts that a browser run cannot pin cheaply:
 *   1. A shortcut answer is published into the CopilotKit thread AND kept in local state, so the
 *      tail must skip local messages the transcript already shows, or the renter sees it twice.
 *   2. The `messageView` wrapper renders the stock list and then the tail as siblings, and never
 *      uses the stock list's `children` render prop, which would switch virtualization off.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import React, { useEffect } from "react";
import { act } from "react";
import { createRoot } from "react-dom/client";

const stockProps = vi.hoisted(() => ({ last: undefined as Record<string, unknown> | undefined }));

vi.mock("@copilotkit/react-core/v2", () => {
  const CopilotChatMessageView = (props: Record<string, unknown>) => {
    stockProps.last = props;
    return React.createElement("div", { "data-testid": "stock-message-list" });
  };
  return {
    CopilotChatMessageView,
    CopilotChatView: () => null,
  };
});

vi.mock("@/components/chat/concierge-coagent-context", () => ({
  useConciergeCoAgent: () => ({ agent: undefined }),
}));
vi.mock("@/lib/hooks/use-concierge-send-handlers", () => ({
  useConciergeSendHandlers: () => ({}),
}));
vi.mock("@/lib/concierge-send-user-message", () => ({
  sendConciergeUserMessage: vi.fn(),
}));
// The result panels read their own contexts; this test is about order and ownership, not cards.
vi.mock("@/components/chat/rental-fast-path-panel", () => ({ RentalFastPathPanel: () => null }));
vi.mock("@/components/chat/event-fast-path-panel", () => ({ EventFastPathPanel: () => null }));
vi.mock("@/components/chat/grounded-fast-path-panel", () => ({ GroundedFastPathPanel: () => null }));
vi.mock("@/components/chat/restaurant-fast-path-panel", () => ({ RestaurantFastPathPanel: () => null }));

vi.mock("@/components/chat/restaurant-filter-chips", () => ({
  RestaurantFilterChips: () => React.createElement("div", { "data-testid": "filter-chips" }),
}));

import { ConciergeMessageView } from "@/components/chat/concierge-copilot-chat-view";
import { ConciergeLocalChatMessages } from "@/components/chat/concierge-local-chat-messages";
import { ConciergeTranscriptTail } from "@/components/chat/concierge-transcript-tail";
import {
  EventLocalChatProvider,
  useEventLocalChat,
} from "@/components/chat/event-local-chat-context";
import {
  EventSearchResultsProvider,
  useEventSearchResults,
} from "@/components/chat/event-search-results-context";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function mount(element: React.ReactElement) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => { root.render(element); });
  return {
    container,
    unmount: () => {
      act(() => { root.unmount(); });
      container.remove();
    },
  };
}

/**
 * Shows two exchanges, then renders the local messages hiding only the FIRST exchange's ids when
 * the transcript is said to have it. The second exchange is the positive control: it must still
 * show, so a "hidden" assertion cannot pass just because nothing rendered.
 */
function Scenario({ transcriptHasExchange }: { transcriptHasExchange: boolean }) {
  const { messages, showExchange } = useEventLocalChat();
  useEffect(() => {
    showExchange("1BR in Laureles", "Found 4 rentals");
    showExchange("Second question", "Second answer");
  }, [showExchange]);
  const excludeIds = transcriptHasExchange
    ? new Set(messages.slice(0, 2).map((m) => m.id))
    : new Set<string>();
  return <ConciergeLocalChatMessages excludeIds={excludeIds} />;
}

describe("ConciergeLocalChatMessages (SAN-966)", () => {
  it("shows a shortcut exchange the transcript does not have, once", () => {
    const { container, unmount } = mount(
      <EventLocalChatProvider>
        <Scenario transcriptHasExchange={false} />
      </EventLocalChatProvider>,
    );
    expect(container.textContent?.match(/Found 4 rentals/g)).toHaveLength(1);
    expect(container.textContent?.match(/1BR in Laureles/g)).toHaveLength(1);
    unmount();
  });

  it("does not repeat an exchange the CopilotKit transcript already shows", () => {
    const { container, unmount } = mount(
      <EventLocalChatProvider>
        <Scenario transcriptHasExchange />
      </EventLocalChatProvider>,
    );
    expect(container.textContent).not.toContain("Found 4 rentals");
    expect(container.textContent).not.toContain("1BR in Laureles");
    // Positive control: the exchange the transcript does not have is still shown.
    expect(container.textContent).toContain("Second answer");
    unmount();
  });
});

/** Shows a restaurant clarifying question, then renders local messages hiding the ids given. */
function ClarifyScenario({ transcriptHasIt }: { transcriptHasIt: boolean }) {
  const { messages, showClarify } = useEventLocalChat();
  useEffect(() => {
    showClarify("find restaurants", "Which cuisine?", "restaurant");
  }, [showClarify]);
  const excludeIds = transcriptHasIt ? new Set(messages.map((m) => m.id)) : new Set<string>();
  return <ConciergeLocalChatMessages excludeIds={excludeIds} />;
}

function EventCitationScenario() {
  const { setWebCitations } = useEventSearchResults();
  useEffect(() => {
    setWebCitations([
      {
        title: "Medellín event source",
        url: "https://example.com/medellin-events",
        snippet: "Verified event source",
      },
    ]);
  }, [setWebCitations]);
  return <ConciergeTranscriptTail />;
}

describe("ConciergeTranscriptTail event citations (SAN-966)", () => {
  it("keeps the real event citation panel inside the transcript tail", () => {
    const { container, unmount } = mount(
      <EventLocalChatProvider>
        <EventSearchResultsProvider>
          <EventCitationScenario />
        </EventSearchResultsProvider>
      </EventLocalChatProvider>,
    );
    const tail = container.querySelector('[data-testid="concierge-transcript-tail"]');
    const panel = container.querySelector('[data-testid="event-results-panel"]');
    const link = container.querySelector('[data-testid="web-citation-link"]');
    expect(tail).not.toBeNull();
    expect(panel).not.toBeNull();
    expect(link?.textContent).toBe("Medellín event source");
    expect(tail?.contains(panel)).toBe(true);
    unmount();
  });
});

describe("ConciergeLocalChatMessages clarify (SAN-966)", () => {
  it("keeps the filter chips but not a second copy of the question the transcript shows", () => {
    const { container, unmount } = mount(
      <EventLocalChatProvider>
        <ClarifyScenario transcriptHasIt />
      </EventLocalChatProvider>,
    );
    expect(container.textContent).not.toContain("Which cuisine?");
    expect(container.querySelector('[data-testid="filter-chips"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="restaurant-clarify"]')).not.toBeNull();
    unmount();
  });

  it("shows the whole clarifying exchange when there is no transcript", () => {
    const { container, unmount } = mount(
      <EventLocalChatProvider>
        <ClarifyScenario transcriptHasIt={false} />
      </EventLocalChatProvider>,
    );
    expect(container.textContent?.match(/Which cuisine\?/g)).toHaveLength(1);
    expect(container.textContent?.match(/find restaurants/g)).toHaveLength(1);
    expect(container.querySelector('[data-testid="filter-chips"]')).not.toBeNull();
    unmount();
  });
});

describe("ConciergeMessageView (SAN-966)", () => {
  beforeEach(() => {
    stockProps.last = undefined;
  });

  it("renders the stock message list first, then the results tail", () => {
    const { container, unmount } = mount(
      <EventLocalChatProvider>
        <EventSearchResultsProvider>
          <ConciergeMessageView messages={[{ id: "a1", role: "assistant" as const, content: "hi" }]} />
        </EventSearchResultsProvider>
      </EventLocalChatProvider>,
    );
    const list = container.querySelector('[data-testid="stock-message-list"]');
    const tail = container.querySelector('[data-testid="concierge-transcript-tail"]');
    expect(list).not.toBeNull();
    expect(tail).not.toBeNull();
    if (!list || !tail) throw new Error("Expected stock message list and transcript tail");
    expect(list.compareDocumentPosition(tail) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    unmount();
  });

  it("passes the stock list its props unchanged and never a `children` render prop", () => {
    const messages = [{ id: "a1", role: "assistant" as const, content: "hi" }];
    const { unmount } = mount(
      <EventLocalChatProvider>
        <EventSearchResultsProvider>
          <ConciergeMessageView messages={messages} isRunning />
        </EventSearchResultsProvider>
      </EventLocalChatProvider>,
    );
    expect(stockProps.last?.messages).toBe(messages);
    expect(stockProps.last?.isRunning).toBe(true);
    // A `children` render prop silently disables the stock list's virtualization.
    expect("children" in (stockProps.last ?? {})).toBe(false);
    unmount();
  });
});
