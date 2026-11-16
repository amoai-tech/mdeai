// @vitest-environment jsdom
/**
 * SAN-1658 — the editable viewing proposal. Proves, against the real React
 * component, that the renter's edit is what Continue hands to the existing
 * modal, that a later AI render cannot overwrite it, and that nothing is written.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { ViewingProposalView, checkViewingDraft } from "../viewing-proposal";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/** A date that is always in the future for the listing zone. */
const future = (days: number) => {
  const d = new Date(Date.now() + days * 86_400_000);
  return d.toISOString().slice(0, 10);
};

let container: HTMLDivElement;
let root: Root;
const fetchSpy = vi.fn();

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  vi.stubGlobal("fetch", fetchSpy);
  fetchSpy.mockReset();
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

type Props = Parameters<typeof ViewingProposalView>[0];
const base = (over: Partial<Props> = {}): Props => ({
  title: "Bright 2BR",
  neighborhood: "Laureles",
  initialDate: future(10),
  initialTime: "15:15",
  canRequest: true,
  onContinue: vi.fn(),
  ...over,
});
const render = (props: Props) => act(() => root.render(<ViewingProposalView {...props} />));
const q = <T extends Element>(id: string) => container.querySelector<T>(`[data-testid="${id}"]`)!;

/** Type into a controlled input the way a browser does. */
function type(input: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
  act(() => {
    setter.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}
const click = (el: Element) => act(() => el.dispatchEvent(new MouseEvent("click", { bubbles: true })));

describe("ViewingProposalView", () => {
  it("hands the renter's edited time (15:15 -> 16:00) to Continue and makes no network call", () => {
    const props = base();
    render(props);
    expect(q<HTMLInputElement>("viewing-proposal-time").value).toBe("15:15");
    type(q<HTMLInputElement>("viewing-proposal-time"), "16:00");
    click(q("viewing-proposal-continue"));
    expect(props.onContinue).toHaveBeenCalledTimes(1);
    expect(props.onContinue).toHaveBeenCalledWith(`${props.initialDate}T16:00`);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("a later AI render of the same proposal cannot overwrite the renter's edit", () => {
    const props = base();
    render(props);
    type(q<HTMLInputElement>("viewing-proposal-time"), "16:00");
    render({ ...props, initialTime: "09:00" });
    expect(q<HTMLInputElement>("viewing-proposal-time").value).toBe("16:00");
    click(q("viewing-proposal-continue"));
    expect(props.onContinue).toHaveBeenCalledWith(`${props.initialDate}T16:00`);
  });

  it("lets the AI refine its proposal until the renter touches a field", () => {
    const props = base();
    render(props);
    render({ ...props, initialTime: "17:30" });
    expect(q<HTMLInputElement>("viewing-proposal-time").value).toBe("17:30");
  });

  it("rejects a past or incomplete time before the modal opens", () => {
    const props = base({ initialDate: "2020-01-02", initialTime: "10:00" });
    render(props);
    click(q("viewing-proposal-continue"));
    expect(q("viewing-proposal-error").textContent).toMatch(/future/i);
    type(q<HTMLInputElement>("viewing-proposal-date"), "");
    click(q("viewing-proposal-continue"));
    expect(q("viewing-proposal-error").textContent).toMatch(/choose a date and a time/i);
    expect(props.onContinue).not.toHaveBeenCalled();
  });

  it("cannot continue when the apartment cannot take a request, and says so truthfully", () => {
    const props = base({ canRequest: false });
    render(props);
    expect(q<HTMLButtonElement>("viewing-proposal-continue").disabled).toBe(true);
    expect(q("viewing-proposal-unavailable").textContent).toMatch(/not taking viewing requests/i);
    expect(container.textContent).toMatch(/not confirmed/i);
  });
});

describe("checkViewingDraft (America/Bogota wall clock)", () => {
  it("accepts a future wall clock and rejects past, impossible and incomplete values", () => {
    expect(checkViewingDraft(future(5), "16:00")).toBe("ok");
    expect(checkViewingDraft("2020-01-02", "10:00")).toBe("past");
    expect(checkViewingDraft("2026-02-30", "10:00")).toBe("invalid");
    expect(checkViewingDraft("", "10:00")).toBe("missing");
  });
});
