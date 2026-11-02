"use client";

import { useEffect, useState } from "react";

/** Height a real on-screen keyboard covers; small viewport changes are not a keyboard. */
function keyboardOverlap(viewport: VisualViewport): number {
  // Pinch-zoom shrinks `visualViewport.height` while the layout viewport stays put. Measuring the
  // unzoomed height (`height / scale`) keeps zoom from reading as a keyboard for every consumer of
  // this helper (the viewing dialog inset, the published CSS height and the bar).
  const unzoomedHeight = viewport.scale > 0 ? viewport.height / viewport.scale : viewport.height;
  const uncovered = Math.round(window.innerHeight - unzoomedHeight);
  return uncovered > 150 ? uncovered : 0;
}

/**
 * The overlay keyboard's lift in pixels, using the same >150px threshold as `useKeyboardInset`.
 *
 * Callers that compensate for the lift must use this, not a raw `innerHeight - visualViewport.height`:
 * mobile emulation and collapsing browser toolbars leave a smaller gap (measured ~128px) that is not
 * a keyboard, and subtracting it would move fixed controls by that amount.
 */
export function keyboardLiftPx(): number {
  const viewport = window.visualViewport;
  return viewport ? keyboardOverlap(viewport) : 0;
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
 * a plain inset cannot tell a keyboard from a genuinely smaller window.
 *
 * The fallback signal is a keyboard-sized layout shrink **while a chat composer is focused**,
 * measured against the layout height captured while nothing was focused and latched until blur or
 * until the height returns. Latched on purpose: an expiry window would drop a keyboard that is
 * still open on a long typing session, a rotation or a toolbar collapse.
 */
export function useOnScreenKeyboard(): boolean {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const viewport = window.visualViewport;
    const COMPOSER = '[data-testid="copilot-chat-input"]';
    /** A keyboard-sized layout shrink; matches the overlay threshold. */
    const KEYBOARD_MIN = 150;
    /** A shrink this small means the keyboard is gone (browser chrome offsets stay below it). */
    const KEYBOARD_RELEASE = 50;
    /** Layout height with no keyboard, captured only while the composer is unfocused. */
    let restingHeight = window.innerHeight;
    /**
     * Latched by a keyboard-sized shrink while typing. Latched — not time-windowed — so a rotate
     * or a toolbar collapse during a long typing session cannot expire a keyboard that is still
     * open; it releases on blur or when the layout height comes back.
     */
    let latched = false;

    const composerHasFocus = () => {
      const active = document.activeElement;
      // `activeElement` can be null during teardown; `closest` is safe on a detached element.
      return active instanceof Element && active.closest(COMPOSER) !== null;
    };

    // ponytail: deliberate ceiling — in browsers that resize the layout viewport with the keyboard
    // (where the overlay measurement below is 0) "the layout shrank a lot while the composer is
    // focused" is the only available signal. It latches, so a real keyboard stays detected through
    // rotation, streaming renders and long sessions; it releases on blur or when the height returns.
    // The ceiling: a mouse/keyboard user who drags the window >150px smaller *while a composer is
    // focused* is read as a keyboard until they blur it. Review/replace this when: the Virtual
    // Keyboard API (`navigator.virtualKeyboard` + `geometrychange`) is available on the browsers we
    // support, or real-device reports show keyboards that resize by more than 50px on dismissal.
    const apply = () => {
      const typing = composerHasFocus();
      const overlay = viewport ? keyboardOverlap(viewport) : 0;
      if (!typing) {
        // No focus: whatever the height is now is the keyboard-free baseline, and no keyboard.
        restingHeight = window.innerHeight;
        latched = false;
      } else if (overlay > 0) {
        latched = true;
      } else {
        const shrunk = restingHeight - window.innerHeight;
        if (shrunk > KEYBOARD_MIN) latched = true;
        else if (shrunk < KEYBOARD_RELEASE) latched = false;
      }
      setOpen(overlay > 0 || (typing && latched));
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
