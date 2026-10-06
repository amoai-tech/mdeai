// @vitest-environment jsdom
/**
 * SAN-966 — the contracts that keep the results tail visible and not repeated.
 *
 *   1. CopilotKit shows its welcome screen, and never mounts `messageView`, while the thread is
 *      empty. The tail lives in `messageView`, so the welcome screen must be switched off whenever
 *      the tail has something to show (e.g. a fast-path result while the AI runtime is down).
 *   2. The dedupe only counts messages the stock list actually renders (user and assistant).
 *   3. A clarifying question the transcript already has leaves only its filter chips, and only
 *      for restaurants.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import React, { useEffect } from "react";
import { act } from "react";
import { createRoot } from "react-dom/client";

vi.mock("@copilotkit/react-core/v2", () => ({
  CopilotChatMessageView: () => React.createElement("div", { "data-testid": "stock-message-list" }),
  CopilotChatView: () => null,
}));
vi.mock("@/components/chat/concierge-coagent-context", () => ({
  useConciergeCoAgent: () => ({ agent: undefined, state: {}, setState: vi.fn() }),
}));
// New Chat (ConciergeSessionProvider) also resets the agent, the map and the rental UI; none of
// that is under test here, so those collaborators are no-ops.
vi.mock("@/lib/hooks/use-concierge-chat", () => ({
  useConciergeChat: () => ({ reset: vi.fn(), stopActiveRun: vi.fn() }),
}));
vi.mock("@/platform/maps/map-context", () => ({
  useMapContext: () => ({ clearPins: vi.fn(), setSelectedPinId: vi.fn(), clearFocusPinRequest: vi.fn() }),
}));
vi.mock("@/components/chat/rich-card-results-context", () => ({
  useRichCardResults: () => ({ clearRichCardCounts: vi.fn() }),
}));
vi.mock("@/components/chat/rental-ui-context", () => ({
  useRentalUi: () => ({
    closeScheduleViewing: vi.fn(),
    closeVenueDetail: vi.fn(),
    closeCafeDetail: vi.fn(),
    closeCafeBooking: vi.fn(),
    closeEventVenueOfferings: vi.fn(),
    closeEventProposalShell: vi.fn(),
    clearLeadConfirmation: vi.fn(),
  }),
}));
vi.mock("@/lib/hooks/use-concierge-send-handlers", () => ({ useConciergeSendHandlers: () => ({}) }));
vi.mock("@/lib/concierge-send-user-message", () => ({ sendConciergeUserMessage: vi.fn() }));
vi.mock("@/components/chat/rental-fast-path-panel", () => ({ RentalFastPathPanel: () => null }));
vi.mock("@/components/chat/event-fast-path-panel", () => ({ EventFastPathPanel: () => null }));
vi.mock("@/components/chat/grounded-fast-path-panel", () => ({ GroundedFastPathPanel: () => null }));
vi.mock("@/components/chat/restaurant-fast-path-panel", () => ({ RestaurantFastPathPanel: () => null }));
vi.mock("@/components/chat/event-results-panel", () => ({ EventResultsPanel: () => null }));
vi.mock("@/components/chat/restaurant-filter-chips", () => ({
  RestaurantFilterChips: () => React.createElement("div", { "data-testid": "filter-chips" }),
}));

import {
  ConciergeMessageView,
  conciergeWelcomeScreen,
} from "@/components/chat/concierge-copilot-chat-view";
import { useTranscriptTailHasContent } from "@/components/chat/concierge-transcript-tail";
import { ConciergeSessionProvider, useConciergeSession } from "@/components/chat/concierge-session-context";
import { EventFastPathProvider, useEventFastPath } from "@/components/chat/event-fast-path-context";
import { EventLocalChatProvider, useEventLocalChat } from "@/components/chat/event-local-chat-context";
import { EventSearchResultsProvider, useEventSearchResults } from "@/components/chat/event-search-results-context";
import { GroundedFastPathProvider, useGroundedFastPath } from "@/components/chat/grounded-fast-path-context";
import { RentalFastPathProvider, useRentalFastPath } from "@/components/chat/rental-fast-path-context";
import { RestaurantFastPathProvider, useRestaurantFastPath } from "@/components/chat/restaurant-fast-path-context";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function Providers({ children }: { children: React.ReactNode }) {
  return (
    <RentalFastPathProvider>
      <EventFastPathProvider>
        <RestaurantFastPathProvider>
          <GroundedFastPathProvider>
            <EventSearchResultsProvider>
              <EventLocalChatProvider>{children}</EventLocalChatProvider>
            </EventSearchResultsProvider>
          </GroundedFastPathProvider>
        </RestaurantFastPathProvider>
      </EventFastPathProvider>
    </RentalFastPathProvider>
  );
}

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

describe("conciergeWelcomeScreen", () => {
  it("turns the welcome screen off when the tail has content, whatever was asked for", () => {
    const Custom = () => null;
    expect(conciergeWelcomeScreen(true, undefined)).toBe(false);
    expect(conciergeWelcomeScreen(true, true)).toBe(false);
    expect(conciergeWelcomeScreen(true, Custom)).toBe(false);
  });

  it("leaves CopilotKit's own choice alone when there is nothing to show", () => {
    const Custom = () => null;
    expect(conciergeWelcomeScreen(false, undefined)).toBeUndefined();
    expect(conciergeWelcomeScreen(false, true)).toBe(true);
    expect(conciergeWelcomeScreen(false, Custom)).toBe(Custom);
  });
});

/** Reports the hook's answer, then applies one change so each source can be tried in turn. */
function HasContent({ change }: { change: "none" | "local" | "rental" | "event" | "grounded" | "restaurant" | "citation" }) {
  const hasContent = useTranscriptTailHasContent();
  const { showExchange } = useEventLocalChat();
  const { setToolResult: setRental } = useRentalFastPath();
  const { setToolResult: setEvent } = useEventFastPath();
  const { setToolResult: setGrounded } = useGroundedFastPath();
  const { setToolResult: setRestaurant } = useRestaurantFastPath();
  const { setWebCitations } = useEventSearchResults();
  useEffect(() => {
    if (change === "local") showExchange("q", "a");
    if (change === "rental") setRental({ results: [] });
    if (change === "event") setEvent({ results: [] });
    if (change === "grounded") setGrounded({ results: [] });
    if (change === "restaurant") setRestaurant({ results: [] });
    if (change === "citation") setWebCitations([{ title: "t", url: "https://example.com", snippet: "s" }]);
  }, [change, showExchange, setRental, setEvent, setGrounded, setRestaurant, setWebCitations]);
  return <span data-testid="has-content">{String(hasContent)}</span>;
}

describe("useTranscriptTailHasContent", () => {
  it("is false when there is nothing to show, so the welcome screen can appear", () => {
    const { container, unmount } = mount(
      <Providers>
        <HasContent change="none" />
      </Providers>,
    );
    expect(container.textContent).toBe("false");
    unmount();
  });

  it.each(["local", "rental", "event", "grounded", "restaurant", "citation"] as const)(
    "is true once there is a %s source to show",
    (change) => {
      const { container, unmount } = mount(
        <Providers>
          <HasContent change={change} />
        </Providers>,
      );
      expect(container.textContent).toBe("true");
      unmount();
    },
  );
});

/** Shows one exchange, then renders the message view with the given roles for the same ids. */
function ViewWithTranscriptRole({ role }: { role: "assistant" | "tool" | "system" }) {
  const { messages, showExchange } = useEventLocalChat();
  useEffect(() => {
    showExchange("Role question", "Role answer");
  }, [showExchange]);
  const transcript = messages.map((m) => ({ id: m.id, role, content: m.content }));
  return <ConciergeMessageView messages={transcript as never} />;
}

describe("the transcript dedupe counts only messages the stock list renders", () => {
  beforeEach(() => vi.clearAllMocks());

  it("hides a local answer the transcript shows as an assistant message", () => {
    const { container, unmount } = mount(
      <Providers>
        <ViewWithTranscriptRole role="assistant" />
      </Providers>,
    );
    expect(container.querySelector('[data-testid="stock-message-list"]')).not.toBeNull();
    expect(container.textContent).not.toContain("Role answer");
    unmount();
  });

  it.each(["tool", "system"] as const)(
    "keeps a local answer whose id appears in the transcript only as a %s message (never rendered)",
    (role) => {
      const { container, unmount } = mount(
        <Providers>
          <ViewWithTranscriptRole role={role} />
        </Providers>,
      );
      expect(container.textContent).toContain("Role answer");
      unmount();
    },
  );
});

type Source = "local" | "rental" | "event" | "grounded" | "restaurant" | "citation";

/** Shows what CopilotChatView would be told about the welcome screen, and lets a test drive it. */
function WelcomeProbe({ source }: { source: Source }) {
  const hasTailContent = useTranscriptTailHasContent();
  const welcome = conciergeWelcomeScreen(hasTailContent, "WELCOME");
  const { startNewChat } = useConciergeSession();
  const { showExchange } = useEventLocalChat();
  const { setToolResult: setRental } = useRentalFastPath();
  const { setToolResult: setEvent } = useEventFastPath();
  const { setToolResult: setGrounded } = useGroundedFastPath();
  const { setToolResult: setRestaurant } = useRestaurantFastPath();
  const { setWebCitations } = useEventSearchResults();
  const show = () => {
    if (source === "local") showExchange("q", "a");
    if (source === "rental") setRental({ results: [] });
    if (source === "event") setEvent({ results: [] });
    if (source === "grounded") setGrounded({ results: [] });
    if (source === "restaurant") setRestaurant({ results: [] });
    if (source === "citation") setWebCitations([{ title: "t", url: "https://example.com", snippet: "s" }]);
  };
  return (
    <>
      <span data-testid="welcome">{String(welcome)}</span>
      <button data-testid="show" onClick={show} />
      <button data-testid="new-chat" onClick={startNewChat} />
    </>
  );
}

describe("the welcome screen comes back after New Chat", () => {
  it.each(["local", "rental", "event", "grounded", "restaurant", "citation"] as const)(
    "%s: allowed when empty, suppressed while a result shows, allowed again after New Chat",
    (source) => {
      const { container, unmount } = mount(
        <Providers>
          <ConciergeSessionProvider>
            <WelcomeProbe source={source} />
          </ConciergeSessionProvider>
        </Providers>,
      );
      const welcome = () => container.querySelector('[data-testid="welcome"]')?.textContent;
      const click = (id: string) =>
        act(() => (container.querySelector(`[data-testid="${id}"]`) as HTMLElement).click());
      expect(welcome()).toBe("WELCOME");
      click("show");
      expect(welcome()).toBe("false");
      click("new-chat");
      expect(welcome()).toBe("WELCOME");
      unmount();
    },
  );
});

/** The transcript has ONE message whose id merely contains the local ids joined by "|". */
function ViewWithPipeInTranscriptId() {
  const { messages, showExchange } = useEventLocalChat();
  useEffect(() => {
    showExchange("Pipe question", "Pipe answer");
  }, [showExchange]);
  const transcript =
    messages.length > 0
      ? [{ id: messages.map((m) => m.id).join("|"), role: "assistant", content: "unrelated" }]
      : [];
  return <ConciergeMessageView messages={transcript as never} />;
}

describe("the transcript id key cannot be confused by a '|' inside an id", () => {
  it("keeps local messages whose ids only appear as pieces of one longer transcript id", () => {
    const { container, unmount } = mount(
      <Providers>
        <ViewWithPipeInTranscriptId />
      </Providers>,
    );
    expect(container.textContent).toContain("Pipe answer");
    unmount();
  });
});

function ClarifyKind({ kind, transcriptHasIt }: { kind: "event" | "rental" | "restaurant"; transcriptHasIt: boolean }) {
  const { messages, showClarify } = useEventLocalChat();
  useEffect(() => {
    showClarify("find something", "Which one?", kind);
  }, [kind, showClarify]);
  const transcript = transcriptHasIt ? messages.map((m) => ({ id: m.id, role: m.role, content: m.content })) : [];
  return <ConciergeMessageView messages={transcript as never} />;
}

describe("a clarifying question the transcript already shows", () => {
  it("keeps only the filter chips for a restaurant", () => {
    const { container, unmount } = mount(
      <Providers>
        <ClarifyKind kind="restaurant" transcriptHasIt />
      </Providers>,
    );
    expect(container.textContent).not.toContain("Which one?");
    expect(container.querySelector('[data-testid="filter-chips"]')).not.toBeNull();
    unmount();
  });

  it.each(["event", "rental"] as const)("leaves nothing behind for a %s clarify, not even an empty wrapper", (kind) => {
    const { container, unmount } = mount(
      <Providers>
        <ClarifyKind kind={kind} transcriptHasIt />
      </Providers>,
    );
    expect(container.querySelector('[data-testid="event-clarify"]')).toBeNull();
    expect(container.querySelector('[data-testid="concierge-local-messages"]')).toBeNull();
    unmount();
  });

  it("shows the whole clarify when the transcript does not have it (positive control)", () => {
    const { container, unmount } = mount(
      <Providers>
        <ClarifyKind kind="event" transcriptHasIt={false} />
      </Providers>,
    );
    expect(container.textContent).toContain("Which one?");
    unmount();
  });
});
