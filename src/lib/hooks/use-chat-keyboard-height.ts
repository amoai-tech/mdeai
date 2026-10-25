"use client";

import { useEffect, useState } from "react";

/** Height a real on-screen keyboard covers; small viewport changes are not a keyboard. */
function keyboardOverlap(viewport: VisualViewport): number {
  const uncovered = Math.round(window.innerHeight - viewport.height);
  return uncovered > 150 ? uncovered : 0;
}

/**
 * The part of the layout viewport an on-screen keyboard covers.
 *
 * iOS Safari overlays the keyboard instead of resizing the layout viewport, so
 * `100dvh` and `position: fixed` still describe the full screen. A fixed dialog
 * that must keep a control reachable needs this inset, not `dvh`. Returns 0
 * before hydration, on desktop, and for small viewport changes that are not a
 * keyboard (the >150px threshold matches CopilotKit's own check).
 */
export function useKeyboardInset(): number {
  const [inset, setInset] = useState(0);

  useEffect(() => {
    const viewport = window.visualViewport;
    if (!viewport) return;
    const apply = () => setInset(keyboardOverlap(viewport));
    apply();
    viewport.addEventListener("resize", apply);
    viewport.addEventListener("scroll", apply);
    return () => {
      viewport.removeEventListener("resize", apply);
      viewport.removeEventListener("scroll", apply);
    };
  }, []);

  return inset;
}

/**
 * MOB-CK-001 — publish the on-screen keyboard height as a CSS variable.
 *
 * CopilotKit lifts the thread composer itself (CopilotChatInput translates by
 * `keyboardHeight`), but its welcome-screen input never receives that height.
 * On iOS the keyboard overlays the layout viewport, so on an empty /chat the
 * composer could still sit behind the keyboard. Exposing the gap lets the
 * welcome screen reserve room for it. The >150px threshold matches CopilotKit's
 * own `isKeyboardOpen` so shell padding and its composer lift never disagree.
 */
export function useChatKeyboardHeight(): void {
  useEffect(() => {
    const viewport = window.visualViewport;
    if (!viewport) return;
    const root = document.documentElement;
    let frame = 0;
    // The welcome screen is scrollable, and CopilotKit's composer auto-grows as
    // the renter types. A keyboard inset alone cannot keep a tall draft visible
    // if the scroll position is unchanged after that growth.
    const revealComposer = () => {
      if (keyboardOverlap(viewport) === 0) return;
      const welcome = document.querySelector<HTMLElement>(
        '.mde-chat-viewport [data-testid="copilot-welcome-screen"]',
      );
      const send = welcome?.querySelector<HTMLElement>(
        '[data-testid="copilot-send-button"]',
      );
      if (!welcome || !send) return;
      const visualBottom = viewport.offsetTop + viewport.height;
      const obscured = send.getBoundingClientRect().bottom - visualBottom + 8;
      if (obscured > 0) welcome.scrollTop += obscured;
    };
    const scheduleReveal = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(revealComposer);
    };
    const apply = () => {
      root.style.setProperty(
        "--mde-keyboard-height",
        `${keyboardOverlap(viewport)}px`,
      );
      scheduleReveal();
    };
    const onInput = (event: Event) => {
      if (
        event.target instanceof HTMLTextAreaElement &&
        event.target.closest(".mde-chat-viewport")
      ) scheduleReveal();
    };
    apply();
    viewport.addEventListener("resize", apply);
    viewport.addEventListener("scroll", apply);
    document.addEventListener("input", onInput, true);
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener("input", onInput, true);
      viewport.removeEventListener("resize", apply);
      viewport.removeEventListener("scroll", apply);
      root.style.removeProperty("--mde-keyboard-height");
    };
  }, []);
}
