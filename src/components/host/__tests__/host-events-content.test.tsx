import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
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

describe("HostEventsContent", () => {
  it("renders the real host rows and an /app create destination", () => {
    const html = renderToStaticMarkup(
      <HostEventsContent
        events={[event]}
        error={null}
        newEventHref="/app/events/new"
      />,
    );

    expect(html).toContain('data-testid="host-events-list"');
    expect(html).toContain("SAN-1577 Salsa Night");
    expect(html).toContain('data-testid="host-events-new"');
    expect(html).toContain('href="/app/events/new"');
    expect(html).toContain("<div");
    // /app/events must not add a nested main landmark inside AppShell.
    expect(html).not.toContain("<main");
  });

  it("shows the error state, never the empty list, when the query failed", () => {
    const html = renderToStaticMarkup(
      <HostEventsContent
        events={[]}
        error="permission denied"
        newEventHref="/app/events/new"
      />,
    );

    expect(html).toContain('data-testid="host-events-error"');
    expect(html).not.toContain('data-testid="host-events-empty"');
    expect(html).not.toContain('data-testid="host-events-list"');
  });

  it("shows the empty state with a working first-event CTA", () => {
    const html = renderToStaticMarkup(
      <HostEventsContent
        events={[]}
        error={null}
        newEventHref="/host/event/new"
        backToChatHref="/chat"
      />,
    );

    expect(html).toContain('data-testid="host-events-empty"');
    expect(html).toContain('data-testid="host-events-create-cta"');
    expect(html).toContain('href="/host/event/new"');
    expect(html).toContain('href="/chat"');
    expect(html).not.toContain('data-testid="host-events-error"');
  });
});
