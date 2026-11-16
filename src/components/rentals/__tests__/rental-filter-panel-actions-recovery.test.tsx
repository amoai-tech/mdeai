// @vitest-environment jsdom
/**
 * F5 — Apply must recover when a navigation ends without changing the URL
 * filters. Before the transition fix the in-flight guard stayed set, so every
 * later Apply answered "already in progress" until the page was reloaded.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

const push = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, replace: vi.fn(), back: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }),
}));

type Handler = () => { ok: boolean; error?: string; status?: string; url?: string };
let handler: Handler | null = null;
vi.mock("@copilotkit/react-core/v2/generative-ui", async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return {
    ...actual,
    useGenerativeUIFunction: (_ui: unknown, _name: string, fn: Handler) => {
      handler = fn;
    },
  };
});

import { RentalFilterPanelActions } from "../rental-filter-panel-actions";
import { RentalFilterDraftProvider, setRentalFilterDraftBeds } from "../rental-filter-draft";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;
const filters = { neighborhood: null, beds: "1", from: null, through: null };

beforeEach(async () => {
  push.mockReset();
  handler = null;
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () =>
    root.render(
      <RentalFilterDraftProvider initialBeds="1">
        <RentalFilterPanelActions filters={filters} />
      </RentalFilterDraftProvider>,
    ),
  );
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe("Apply recovery after a navigation that never changed the filters", () => {
  it("pushes once for a real change, then allows a retry once the navigation settled", async () => {
    await act(async () => setRentalFilterDraftBeds("2"));
    let first!: ReturnType<Handler>;
    await act(async () => {
      first = handler!();
    });
    expect(first).toMatchObject({ ok: true, status: "navigation_requested" });
    expect(push).toHaveBeenCalledTimes(1);

    // The mocked push resolves without changing the URL filters (a failed or
    // interrupted navigation). The guard must be free again for a retry.
    let retry!: ReturnType<Handler>;
    await act(async () => {
      retry = handler!();
    });
    expect(retry).toMatchObject({ ok: true, status: "navigation_requested" });
    expect(push).toHaveBeenCalledTimes(2);
  });

  it("still refuses a value the URL already has", async () => {
    await act(async () => setRentalFilterDraftBeds("1"));
    let result!: ReturnType<Handler>;
    await act(async () => {
      result = handler!();
    });
    expect(result).toMatchObject({ ok: false, error: expect.stringMatching(/already applied/i) });
    expect(push).not.toHaveBeenCalled();
  });
});
