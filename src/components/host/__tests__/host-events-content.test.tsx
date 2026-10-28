// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { HostEventsContent } from "@/components/host/host-events-content";
import type { HostEventCardProps } from "@/components/host/host-event-card";

vi.mock("next/link", () => ({
  default: ({
    href,
    children,
    ...props
  }: {
    href: string;
    children: React.ReactNode;
  }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

const event: HostEventCardProps = {
  id: "e1",
  title: "SAN-1577 Salsa Night",
  venue: "Parque Lleras",
  neighborhood: "El Poblado",
  startsAt: "2027-06-12T22:00:00.000Z",
  priceMin: 50_000,
  status: "draft",
  slug: "san-1577-salsa",
};

afterEach(cleanup);

// DOM assertions (not HTML strings) keep the test aligned with Codacy XSS rules.
describe("HostEventsContent", () => {
  it("renders the real host rows and an /app create destination", () => {
    const { container } = render(
      <HostEventsContent
        events={[event]}
        error={null}
        newEventHref="/app/events/new"
      />,
    );

    expect(screen.getByTestId("host-events-list")).toBeTruthy();
    expect(screen.getByText("SAN-1577 Salsa Night")).toBeTruthy();
    expect(screen.getByTestId("host-events-new").getAttribute("href")).toBe(
      "/app/events/new",
    );
    expect(container.querySelector("main")).toBeNull();
  });

  it("shows the error state, never the empty list, when the query failed", () => {
    render(
      <HostEventsContent
        events={[]}
        error="permission denied"
        newEventHref="/app/events/new"
      />,
    );

    expect(screen.getByTestId("host-events-error")).toBeTruthy();
    expect(screen.queryByTestId("host-events-empty")).toBeNull();
    expect(screen.queryByTestId("host-events-list")).toBeNull();
  });

  it("shows the empty state with a working first-event CTA", () => {
    render(
      <HostEventsContent
        events={[]}
        error={null}
        newEventHref="/host/event/new"
        backToChatHref="/chat"
      />,
    );

    expect(screen.getByTestId("host-events-empty")).toBeTruthy();
    expect(
      screen.getByTestId("host-events-create-cta").getAttribute("href"),
    ).toBe("/host/event/new");
    expect(screen.getByRole("link", { name: /chat/i }).getAttribute("href")).toBe(
      "/chat",
    );
    expect(screen.queryByTestId("host-events-error")).toBeNull();
  });
});
