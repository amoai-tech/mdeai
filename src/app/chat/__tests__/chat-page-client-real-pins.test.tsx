import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { ChatPageClient } from "../chat-page-client";

vi.mock("@/components/chat/geo-chat-shell", async () => {
  const { useMapContext } = await import("@/platform/maps/map-context");
  return {
    GeoChatShell: () => (
      <output data-testid="initial-map-pins">{useMapContext().pins.length}</output>
    ),
  };
});

describe("ChatPageClient map safety", () => {
  it("starts without demo apartment pins while no rental search has run", () => {
    const html = renderToStaticMarkup(<ChatPageClient />);
    expect(html).toContain('data-testid="initial-map-pins">0</output>');
    expect(html).not.toContain("mock-laureles-pin");
  });
});
