// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import { act } from "react";
import { DETAILS_PANEL_ATTR, useEscapeToClose } from "../use-escape-to-close";

/**
 * Escape closes Details only when it came from inside the panel or from the page chrome.
 *
 * The first version listened on `window` and closed on any Escape, so pressing Escape in the Ask
 * composer closed the panel, cleared the selection, and moved focus out of the input.
 */
const press = (target: Element) =>
  act(() => {
    target.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
  });

/** A Details region with one focusable control inside it. */
function panel() {
  const section = document.createElement("section");
  section.setAttribute(DETAILS_PANEL_ATTR, "");
  const button = document.createElement("button");
  button.type = "button";
  section.append(button);
  document.body.append(section);
  return { section, button };
}

afterEach(() => {
  document.body.innerHTML = "";
});

describe("useEscapeToClose", () => {
  it("closes when Escape is pressed in the page chrome or inside the panel", () => {
    const onClose = vi.fn();
    renderHook(() => useEscapeToClose(true, onClose));
    const { button } = panel();

    press(document.body);
    press(button);

    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it("keeps Escape for the Ask composer and for controls outside the panel", () => {
    const onClose = vi.fn();
    renderHook(() => useEscapeToClose(true, onClose));
    panel();

    const composer = document.createElement("textarea");
    document.body.append(composer);
    press(composer);

    // A card action, or any other page control, is not the panel.
    const elsewhere = document.createElement("button");
    document.body.append(elsewhere);
    press(elsewhere);

    expect(onClose).not.toHaveBeenCalled();
  });

  it("does nothing while the panel is closed", () => {
    const onClose = vi.fn();
    renderHook(() => useEscapeToClose(false, onClose));
    press(document.body);
    expect(onClose).not.toHaveBeenCalled();
  });
});
