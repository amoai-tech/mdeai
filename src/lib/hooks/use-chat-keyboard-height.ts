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
 * Is an on-screen keyboard open, in **both** browser behaviours?
 *
 * `useKeyboardInset` only sees the overlay mode: iOS Safari shrinks the visual viewport and leaves
 * the layout viewport at full height. Chrome on Android resizes *both* viewports (this app sets
 * `interactiveWidget: "resizes-content"`), so `innerHeight - visualViewport.height` is 0 there and
 * a plain inset cannot tell a keyboard from a genuinely smaller window. Track the tallest layout
 * viewport seen since mount and treat a >150px shrink as a keyboard **while a chat composer has
 * focus** — typing is the signal, so dragging a desktop window smaller does not count.
 */
export function useOnScreenKeyboard(): boolean {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const viewport = window.visualViewport;
    let tallest = window.innerHeight;
    const apply = () => {
      tallest = Math.max(tallest, window.innerHeight);
      const overlay = viewport ? keyboardOverlap(viewport) : 0;
      const shrunk = tallest - window.innerHeight;
      const typing =
        document.activeElement instanceof Element &&
        document.activeElement.closest('[data-testid="copilot-chat-input"]') !== null;
      setOpen(overlay > 0 || (shrunk > 150 && typing));
    };
    apply();
    window.addEventListener("resize", apply);
    document.addEventListener("focusin", apply);
    document.addEventListener("focusout", apply);
    viewport?.addEventListener("resize", apply);
    viewport?.addEventListener("scroll", apply);
    return () => {
      window.removeEventListener("resize", apply);
      document.removeEventListener("focusin", apply);
      document.removeEventListener("focusout", apply);
      viewport?.removeEventListener("resize", apply);
      viewport?.removeEventListener("scroll", apply);
    };
  }, []);

  return open;
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
