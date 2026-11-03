// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { RestaurantAdminAssignment } from "./restaurant-admin-assignment";

const { refresh } = vi.hoisted(() => ({ refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));
const restaurantId = "00000000-0000-4000-8000-000000000001";
const partnerId = "00000000-0000-4000-8000-000000000002";
const auditId = "00000000-0000-4000-8000-000000000003";
function renderPanel() {
  render(<RestaurantAdminAssignment restaurantId={restaurantId} assignedPartnerId={null}
    partners={[{ id: partnerId, name: "Partner A" }]} />);
}
describe("SAN-1604 explicit restaurant handoff", () => {
  beforeEach(() => { vi.restoreAllMocks(); refresh.mockClear(); });
  it("does not transfer on selection or cancel", () => {
    const send = vi.spyOn(globalThis,"fetch").mockResolvedValue({} as Response);
    renderPanel();
    fireEvent.change(screen.getByRole("combobox"), {target:{value:partnerId}});
    expect(send).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button",{name:"Review change"}));
    expect(screen.getByText(/Transfer management to/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button",{name:"Cancel"}));
    expect(send).not.toHaveBeenCalled();
  });
  it("sends the expected previous id, reason and verifies real receipt", async () => {
    const send = vi.spyOn(globalThis,"fetch").mockResolvedValue({ok:true,json:async()=>({success:true,partnerId,changed:true,auditId})} as Response);
    renderPanel();
    fireEvent.change(screen.getByRole("combobox"), {target:{value:partnerId}});
    fireEvent.click(screen.getByRole("button",{name:"Review change"}));
    fireEvent.click(screen.getByRole("button",{name:"Confirm transfer"}));
    await waitFor(() => expect(screen.getByTestId("restaurant-assignment-saved")).toBeTruthy());
    expect(refresh).toHaveBeenCalledOnce();
    expect(send).toHaveBeenCalledOnce();
    const body=JSON.parse((send.mock.calls[0][1] as RequestInit).body as string);
    expect(body).toEqual({ partnerId, expectedPartnerId:null, reason:"Restaurant partner management handoff" });
  });
  it("shows a conflict and retains selection for explicit retry", async () => {
    vi.spyOn(globalThis,"fetch").mockResolvedValue({ok:false,status:409,json:async()=>({success:false,error:{message:"The assignment changed. Refresh and try again."}})} as Response);
    renderPanel();
    fireEvent.change(screen.getByRole("combobox"), {target:{value:partnerId}});
    fireEvent.click(screen.getByRole("button",{name:"Review change"}));
    fireEvent.click(screen.getByRole("button",{name:"Confirm transfer"}));
    await waitFor(()=>expect(screen.getByRole("alert").textContent).toContain("assignment changed"));
    expect((screen.getByRole("combobox") as HTMLSelectElement).value).toBe(partnerId);
    expect(refresh).not.toHaveBeenCalled();
  });
});
