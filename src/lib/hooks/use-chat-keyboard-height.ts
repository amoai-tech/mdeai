"use client";

import { useEffect } from "react";

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
    const apply = () => {
      const uncovered = Math.round(window.innerHeight - viewport.height);
      root.style.setProperty(
        "--mde-keyboard-height",
        `${uncovered > 150 ? uncovered : 0}px`,
      );
    };
    apply();
    viewport.addEventListener("resize", apply);
    viewport.addEventListener("scroll", apply);
    return () => {
      viewport.removeEventListener("resize", apply);
      viewport.removeEventListener("scroll", apply);
      root.style.removeProperty("--mde-keyboard-height");
    };
  }, []);
}
