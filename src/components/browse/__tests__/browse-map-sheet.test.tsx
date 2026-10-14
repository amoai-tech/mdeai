// @vitest-environment jsdom
/**
 * The phone map sheet on the browse pages (rentals, events, restaurants, cafés) must have a
 * Close control a thumb can hit: 44×44 (SAN-524). The default sheet close is 28px.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot } from "react-dom/client";

vi.mock("@/components/maps/MapProvider", () => ({ MapsShell: ({ children }: { children: React.ReactNode }) => <>{children}</> }));
vi.mock("@/components/maps/ChatMap", () => ({ ChatMap: () => <div data-testid="chat-map-stub" /> }));

import { BrowseMapSheet } from "@/components/browse/BrowseMapSheet";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

afterEach(() => {
  document.body.innerHTML = "";
});

describe("BrowseMapSheet close control", () => {
  it("is a single, labelled, 44px-wide Close button that closes the sheet", async () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    await act(async () => root.render(<BrowseMapSheet />));

    await act(async () => {
      (document.querySelector('[data-testid="browse-map-fab"]') as HTMLButtonElement).click();
    });
    const closers = document.querySelectorAll('button[aria-label="Close"]');
    expect(closers).toHaveLength(1); // not the 28px default plus a second one
    const close = closers[0] as HTMLButtonElement;
    expect(close.className).toMatch(/\bsize-11\b/); // 44px; jsdom has no layout to measure

    await act(async () => close.click());
    expect(document.querySelector('[data-testid="chat-map-stub"]')).toBeNull();
    await act(async () => root.unmount());
  });
});
