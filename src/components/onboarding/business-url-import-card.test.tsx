// @vitest-environment jsdom
import { act } from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { BusinessUrlImportCard } from "./business-url-import-card";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("SAN-1193 website draft identity", () => {
  it("clears the previous website proposal when the requested URL changes", async () => {
    const onApply = vi.fn();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        success: true,
        draft: {
          businessName: "Old Café",
          sources: ["https://first.example/"],
        },
      }),
    }));
    render(<BusinessUrlImportCard onApply={onApply} />);
    const input = screen.getByTestId("business-url-input");
    fireEvent.change(input, { target: { value: "https://first.example/" } });
    fireEvent.click(screen.getByTestId("business-url-submit"));
    await waitFor(() => expect(screen.getByTestId("onboarding-suggestion-card")).toBeTruthy());
    await act(async () => {
      fireEvent.change(input, { target: { value: "https://second.example/" } });
    });
    expect(screen.queryByTestId("onboarding-suggestion-card")).toBeNull();
    expect(onApply).not.toHaveBeenCalled();
  });
});
