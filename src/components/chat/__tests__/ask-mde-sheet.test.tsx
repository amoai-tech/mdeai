// @vitest-environment jsdom
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AskMdeSheet } from "../ask-mde-sheet";
import { openAskMde } from "@/lib/chat/ask-mde-bridge";

const mocks = { pathname: "/events/a1b2c3d4-0001-0001-0001-000000000003" };
vi.mock("next/navigation", () => ({ usePathname: () => mocks.pathname, useRouter: () => ({ push: vi.fn() }) }));
vi.mock("next/link", () => ({
  default: ({ href, children, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) =>
    <a href={href} {...props}>{children}</a>,
}));

// The composer is the real discovery surface; here it only proves where it mounts.
const composerMounts: string[] = [];
const composerProps: Array<{ page: string; suggestions?: readonly string[] }> = [];
vi.mock("@/components/chat/discovery-ask-composer", () => ({
  DiscoveryAskComposer: ({ page, suggestions }: { page: string; suggestions?: readonly string[] }) => {
    composerMounts.push(page);
    composerProps.push({ page, suggestions });
    return <div data-testid="shared-composer" data-page={page} />;
  },
  EVENT_DETAIL_ASK_SUGGESTIONS: ["Are tickets available?", "Where is the meeting point?", "What time does it start?"],
}));

const contextMounts: string[] = [];
vi.mock("@/components/chat/discovery-page-context", () => ({
  DiscoveryPageContext: ({ page }: { page: string }) => {
    contextMounts.push(page);
    return <div data-testid="page-context" data-page={page} />;
  },
}));

beforeEach(() => {
  mocks.pathname = "/events/a1b2c3d4-0001-0001-0001-000000000003";
  composerMounts.length = 0;
  composerProps.length = 0;
  contextMounts.length = 0;
});

describe("AskMdeSheet — one assistant, mounted where a page needs it", () => {
  it("stays closed, with no conversation and no model run, until someone asks", () => {
    render(<AskMdeSheet />);
    expect(screen.queryByTestId("shared-composer")).toBeNull();
    expect(composerMounts).toHaveLength(0);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("never mounts a drawer on an event page, because the composer is inline there", async () => {
    // SAN-1624: the event page renders the shared composer below its location, so the
    // sheet must not claim that route and must not answer the open event.
    render(<AskMdeSheet />);
    expect(screen.queryByTestId("ask-mde-launcher")).toBeNull();
    openAskMde();
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(screen.queryByTestId("shared-composer")).toBeNull();
  });

  it("keeps the restaurant drawer and gives it no event questions", async () => {
    mocks.pathname = "/restaurants/la-cocina";
    render(<AskMdeSheet />);
    openAskMde();
    await waitFor(() => expect(composerProps.length).toBeGreaterThan(0));
    expect(composerProps[composerProps.length - 1].suggestions).toBeUndefined();
  });

  it("offers its own launcher where no other Ask MDE control exists", async () => {
    mocks.pathname = "/restaurants/41d0b0aa-0000-4000-8000-000000000001";
    render(<AskMdeSheet />);
    const launcher = screen.getByTestId("ask-mde-launcher");
    expect(launcher.getAttribute("aria-expanded")).toBe("false");
    await userEvent.click(launcher);
    await waitFor(() => expect(screen.getByTestId("shared-composer").getAttribute("data-page")).toBe("restaurants"));
    expect(screen.getByTestId("page-context").getAttribute("data-page")).toBe("restaurants");
  });

  it.each([
    ["/events", "the events catalog already renders its own composer"],
    ["/rentals/8a1f0d2e-0000-4000-8000-000000000001", "rental details own their richer ask adapter"],
    ["/chat", "the full conversation page owns the agent"],
    ["/login", "no agent on auth pages"],
    ["/signup", "no agent on auth pages"],
    ["/host/event/new", "the host workspace owns its agent"],
    ["/app", "the app shell mounts its own contextual surface"],
  ])("does not mount a second assistant on %s (%s)", (pathname) => {
    mocks.pathname = pathname;
    const { container } = render(<AskMdeSheet />);
    expect(container.innerHTML).toBe("");
    expect(composerMounts).toHaveLength(0);
  });
});
