// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RentalTestModePanel } from "./rental-test-mode-panel";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const row = {
  id: "fixture-operator",
  title: "Operator test source rental",
  neighborhood: "Laureles",
  address: "Calle 10",
  price_monthly: 2400000,
  currency: "COP",
  available_from: "2026-11-01",
  status: "active",
  moderation_status: "approved",
  listing_workflow_status: "published",
  verified: false,
  metadata: { is_test_fixture: "false", admin_test_operator_active: "true" as unknown },
};

let root: Root;
let container: HTMLDivElement;
const fetchMock = vi.fn();

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockReset().mockImplementation(async (_url: string, init?: RequestInit) => {
    if (init?.method === "POST") {
      return new Response(JSON.stringify({ rental: { ...row } }), { status: 200 });
    }
    return new Response(JSON.stringify({ rentals: [row], counts: {} }), { status: 200 });
  });
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

describe("MDE test operator button", () => {
  it.each(["true", true])("recognizes active %s metadata, displays Clear and submits enabled=false", async (active) => {
    row.metadata.admin_test_operator_active = active;
    await act(async () => {
      root.render(<RentalTestModePanel />);
      await Promise.resolve();
    });
    const button = container.querySelector<HTMLButtonElement>('[data-testid="admin-test-operator-fixture-operator"]');
    expect(button?.textContent).toContain("Clear MDE test operator");
    await act(async () => {
      button?.click();
      await Promise.resolve();
    });
    const posts = fetchMock.mock.calls.filter(([, options]) => options?.method === "POST");
    expect(posts).toHaveLength(1);
    expect(JSON.parse(posts[0][1].body)).toEqual({
      action: "assign-test-operator", apartmentId: "fixture-operator", enabled: false,
    });
  });

  it("displays Assign and sends enabled=true when metadata is false", async () => {
    row.metadata.admin_test_operator_active = "false";
    await act(async () => {
      root.render(<RentalTestModePanel />);
      await Promise.resolve();
    });
    const button = container.querySelector<HTMLButtonElement>('[data-testid="admin-test-operator-fixture-operator"]');
    expect(button?.textContent).toContain("Assign MDE test operator");
    await act(async () => {
      button?.click();
      await Promise.resolve();
    });
    const posts = fetchMock.mock.calls.filter(([, options]) => options?.method === "POST");
    expect(posts).toHaveLength(1);
    expect(JSON.parse(posts[0][1].body).enabled).toBe(true);
  });
});

describe("Admin rental tables keep mobile overflow inside accessible scroll regions", () => {
  it.each([
    ["admin-rental-table-scroll", "admin-rental-table", "min-w-[760px]", "Rental listings"],
    ["admin-test-access-scroll", "admin-test-access-list", "min-w-[560px]", "Development access grants"],
    ["admin-test-events-scroll", "admin-test-events", "min-w-[520px]", "Development audit trail"],
  ])("keeps %s scrollable and keyboard-accessible", async (wrapperId, tableId, widthClass, label) => {
    await act(async () => {
      root.render(<RentalTestModePanel />);
      await Promise.resolve();
    });
    const scroller = container.querySelector<HTMLElement>(`[data-testid="${wrapperId}"]`);
    expect(scroller).not.toBeNull();
    expect(scroller?.classList.contains("max-w-full")).toBe(true);
    expect(scroller?.classList.contains("overflow-x-auto")).toBe(true);
    expect(scroller?.getAttribute("role")).toBe("region");
    expect(scroller?.getAttribute("aria-label")).toBe(label);
    expect(scroller?.tabIndex).toBe(0);
    const table = scroller?.querySelector(`[data-testid="${tableId}"]`);
    expect(table?.classList.contains(widthClass)).toBe(true);
  });
});
