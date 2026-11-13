// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { ContactHostDialog } from "@/components/rentals/contact-host-dialog";

const invoke = vi.hoisted(() => vi.fn());
vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({ functions: { invoke } }),
}));

beforeEach(() => {
  invoke.mockReset();
  vi.spyOn(globalThis.crypto, "randomUUID").mockReturnValue("a1623000-0000-4000-8000-000000000001");
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

function fillForm() {
  fireEvent.click(screen.getByTestId("rental-contact-host-cta"));
  fireEvent.change(screen.getByLabelText("Your name"), { target: { value: "Camila" } });
  fireEvent.change(screen.getByLabelText("Email for the host to reply"), { target: { value: "camila@example.test" } });
  fireEvent.change(screen.getByLabelText("Message (optional)"), { target: { value: "Is it available next month?" } });
}

describe("Contact Host — renter inquiry", () => {
  it("sends the actual apartment ID, reply address, and stable request ID; only then shows saved", async () => {
    invoke.mockResolvedValue({ data: { success: true, data: { lead_id: "saved-lead" } }, error: null });
    render(<ContactHostDialog apartmentId="123e4567-e89b-42d3-a456-426614174000" title="Laureles flat" />);
    fillForm();
    fireEvent.click(screen.getByTestId("rental-contact-host-submit"));
    await waitFor(() => expect(screen.getByTestId("rental-contact-host-success")).toBeTruthy());
    expect(invoke).toHaveBeenCalledWith("lead-from-form", {
      body: {
        apartment_id: "123e4567-e89b-42d3-a456-426614174000",
        request_id: "a1623000-0000-4000-8000-000000000001",
        name: "Camila",
        email: "camila@example.test",
        move_when: "soon",
        message: "Is it available next month?",
      },
    });
    expect(screen.getByText(/not a confirmed booking/i)).toBeTruthy();
  });

  it("retains the same request ID and user fields when a network failure is retried", async () => {
    invoke.mockRejectedValueOnce(new Error("network lost"))
      .mockResolvedValueOnce({ data: { success: true, data: { lead_id: "existing-lead", replayed: true } }, error: null });
    render(<ContactHostDialog apartmentId="123e4567-e89b-42d3-a456-426614174000" title="Laureles flat" />);
    fillForm();
    fireEvent.click(screen.getByTestId("rental-contact-host-submit"));
    await waitFor(() => expect(screen.getByRole("alert")).toBeTruthy());
    expect((screen.getByLabelText("Email for the host to reply") as HTMLInputElement).value).toBe("camila@example.test");
    fireEvent.click(screen.getByTestId("rental-contact-host-submit"));
    await waitFor(() => expect(screen.getByTestId("rental-contact-host-success")).toBeTruthy());
    expect(invoke).toHaveBeenCalledTimes(2);
    expect(invoke.mock.calls[0][1].body.request_id).toBe(invoke.mock.calls[1][1].body.request_id);
  });

  it("does not display success without a confirmed persisted lead", async () => {
    invoke.mockResolvedValue({ data: { success: true, data: {} }, error: null });
    render(<ContactHostDialog apartmentId="123e4567-e89b-42d3-a456-426614174000" title="Laureles flat" />);
    fillForm();
    fireEvent.click(screen.getByTestId("rental-contact-host-submit"));
    await waitFor(() => expect(screen.getByRole("alert")).toBeTruthy());
    expect(screen.queryByTestId("rental-contact-host-success")).toBeNull();
  });
});
