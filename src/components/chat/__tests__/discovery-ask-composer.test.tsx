// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { fireEvent, render, screen, waitFor, cleanup } from "@testing-library/react";

vi.mock("next/navigation", () => ({ usePathname: () => "/events" }));
vi.mock("@/hooks/use-session", () => ({ useSession: () => ({ user: null, loading: false }) }));
vi.mock("@/lib/deterministic-e2e", () => ({ isDeterministicE2E: () => false }));
vi.mock("@/components/chat/concierge-coagent-context", () => ({
  useOptionalConciergeCoAgent: () => ({ agent: { messages: [], subscribe: () => ({ unsubscribe: () => {} }) }, isReady: false }),
  useConciergeCoAgent: () => ({ agent: { messages: [], subscribe: () => ({ unsubscribe: () => {} }) }, isReady: false }),
}));
vi.mock("@/components/rentals/rental-ask-tool-results", () => ({ useTurns: () => [] }));
vi.mock("@/lib/hooks/use-concierge-chat", () => ({ useConciergeChat: () => ({
  appendMessage: vi.fn(), stopActiveRun: vi.fn(), isLoading: false, isRuntimeUnavailable: () => true,
}) }));
import { DiscoveryAskComposer } from "../discovery-ask-composer";

const matchingId = "5247d1e6-407f-4822-969f-4f7799ef7124";
const options = () => ({ category: "music" as const, onEventIds: vi.fn() });

describe("guest Events Ask MDE (SAN-1250)", () => {
  beforeEach(() => vi.stubGlobal("fetch", vi.fn()));
  afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
  it("uses the existing read-only events search without starting a protected chat", async () => {
    const onEventIds = options();
    vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify({ results: [
      { id: matchingId, title: "Source-backed event" },
      { id: "not-an-uuid", title: "Invalid" },
    ] }), { status: 200 }));
    render(<DiscoveryAskComposer page="events" guestEvents={onEventIds} />);
    fireEvent.change(screen.getByRole("textbox", { name: "Search events" }), { target: { value: "Salsa concerts in Laureles" } });
    fireEvent.click(screen.getByTestId("guest-event-send"));
    await waitFor(() => expect(onEventIds.onEventIds).toHaveBeenCalledWith([matchingId]));
    expect(fetch).toHaveBeenCalledWith("/api/events/search", expect.objectContaining({ method: "POST" }));
    const body = JSON.parse(vi.mocked(fetch).mock.calls[0][1]!.body as string);
    expect(body).toMatchObject({ queryText: "Salsa concerts in Laureles", category: "music" });
  });
  it("shows rate limiting without claiming results or bypassing authentication", async () => {
    const onEventIds = options();
    vi.mocked(fetch).mockResolvedValue(new Response(null, { status: 429 }));
    render(<DiscoveryAskComposer page="events" guestEvents={onEventIds} />);
    fireEvent.change(screen.getByRole("textbox", { name: "Search events" }), { target: { value: "Tonight" } });
    fireEvent.click(screen.getByTestId("guest-event-send"));
    expect((await screen.findByRole("alert")).textContent).toContain("Too many searches");
    expect(onEventIds.onEventIds).not.toHaveBeenCalled();
  });
});
