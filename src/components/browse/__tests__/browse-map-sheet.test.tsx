// @vitest-environment jsdom
/**
 * The phone map sheet on rentals and restaurants (the two current callers) must have a
 * Close control a thumb can hit: 44×44 (SAN-524). The default sheet close is 28px.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot } from "react-dom/client";

vi.mock("@/components/maps/MapProvider", () => ({ MapsShell: ({ children }: { children: React.ReactNode }) => <>{children}</> }));
vi.mock("@/components/maps/ChatMap", () => ({
  ChatMap: ({ mapResizeSignal }: { mapResizeSignal?: number }) => (
    <div data-testid="chat-map-stub" data-resize-signal={String(mapResizeSignal)} />
  ),
}));

import { BrowseMapSheet } from "@/components/browse/BrowseMapSheet";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

afterEach(() => {
  document.body.innerHTML = "";
});

describe("BrowseMapSheet map holder", () => {
  it("gives the map a definite height and a redraw signal, so it is not blank on phones", async () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    await act(async () => root.render(<BrowseMapSheet />));
    await act(async () => {
      (document.querySelector('[data-testid="browse-map-fab"]') as HTMLButtonElement).click();
    });

    const stub = document.querySelector('[data-testid="chat-map-stub"]') as HTMLElement;
    expect(stub).not.toBeNull();
    // Google's map is 100% of its parent; the sheet is `h-auto`, so the holder must carry the height itself.
    const holder = stub.closest("div.relative") as HTMLElement | null;
    // Capped like the chat map sheet, with a floor so a short phone still gets a usable map.
    expect(holder?.className).toMatch(/\bh-\[min\(70vh,520px\)\]/);
    expect(holder?.className).toMatch(/\bmin-h-\[280px\]/);
    // `vh`, not `dvh`: on a browser without `dvh` the whole height declaration is dropped, the holder
    // falls back to auto, and the map is blank again. The safe area is handled on the sheet instead.
    expect(holder?.className).not.toMatch(/dvh/);
    const sheet = holder?.closest('[data-slot="sheet-content"]') as HTMLElement | null;
    expect(sheet?.className).toContain("pb-[env(safe-area-inset-bottom,0px)]");
    // Same redraw signal as the working chat map sheet.
    expect(stub.getAttribute("data-resize-signal")).toBe("1");
    await act(async () => root.unmount());
  });
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
    // The sheet must actually render the map before closing it; otherwise the test is vacuous.
    expect(document.querySelector('[data-testid="chat-map-stub"]')).not.toBeNull();
    const closers = document.querySelectorAll('button[aria-label="Close"]');
    expect(closers).toHaveLength(1); // not the 28px default plus a second one
    const close = closers[0] as HTMLButtonElement;
    expect(close.className).toMatch(/\bsize-11\b/); // 44px; jsdom has no layout to measure

    // The close button must stay in a toolbar outside Google's map viewport:
    // on live Android the 44px close otherwise overlaps the 40px fullscreen control.
    const toolbar = document.querySelector('[data-testid="browse-map-toolbar"]') as HTMLElement | null;
    expect(toolbar).not.toBeNull();
    expect(toolbar?.className).toContain("h-14");
    expect(toolbar?.contains(close)).toBe(true);
    expect(toolbar?.nextElementSibling?.querySelector('[data-testid="chat-map-stub"]')).not.toBeNull();

    await act(async () => close.click());
    expect(document.querySelector('[data-testid="chat-map-stub"]')).toBeNull();
    await act(async () => root.unmount());
  });
});

/** SAN-1421 — when a page pins an Ask MDE composer at the bottom, the phone Map button clears it. */
describe("BrowseMapSheet placement above a pinned composer", () => {
  it("sits above the composer instead of on top of its Send button", async () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    await act(async () => root.render(<BrowseMapSheet raised />));

    const fab = document.querySelector('[data-testid="browse-map-fab"]') as HTMLElement;
    // Bottom offset comes from the composer's measured height, so an open transcript or an error row
    // cannot end up underneath the button; a fixed offset only cleared the collapsed box.
    expect(fab.getAttribute("style")).toContain("--mde-ask-composer-height");
    expect(fab.className).not.toContain("bottom-6");
  });
});
