import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { getServerUser, loadUserViewings, redirect } = vi.hoisted(() => ({
  getServerUser: vi.fn(), loadUserViewings: vi.fn(), redirect: vi.fn(),
}));
vi.mock("@/lib/auth/session", () => ({ getServerUser }));
vi.mock("@/lib/rentals/load-user-viewings", () => ({ loadUserViewings }));
vi.mock("next/navigation", () => ({
  redirect: (path: string) => { redirect(path); throw new Error("redirect"); },
}));
import MyViewingsPage from "../page";

describe("SAN-1426 personal viewings page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getServerUser.mockResolvedValue({ user: { id: "renter-a" } });
  });

  it("redirects guest viewers before querying private status", async () => {
    getServerUser.mockResolvedValue({ user: null });
    await expect(MyViewingsPage()).rejects.toThrow("redirect");
    expect(redirect).toHaveBeenCalledWith("/login?next=/app/me/viewings");
    expect(loadUserViewings).not.toHaveBeenCalled();
  });

  it("shows an honest guest-history explanation for an empty signed-in account", async () => {
    loadUserViewings.mockResolvedValue({ status: "ok", value: [] });
    const html = renderToStaticMarkup(await MyViewingsPage());
    expect(loadUserViewings).toHaveBeenCalledWith("renter-a");
    expect(html).toContain("No linked viewings yet");
    expect(html).toContain("Guest requests");
  });

  it("renders saved requested status and exact Medellín time, not confirmation", async () => {
    loadUserViewings.mockResolvedValue({ status: "ok", value: [{
      id: "showing-1", apartmentId: "apartment-1",
      apartmentTitle: "Apartment A", neighborhood: "Laureles",
      scheduledAt: "2026-11-19T20:00:00.000Z", status: "scheduled",
    }] });
    const html = renderToStaticMarkup(await MyViewingsPage());
    expect(html).toContain("Apartment A");
    expect(html).toContain("Requested");
    expect(html).toContain("3:00");
    expect(html).toContain("Medellín time");
    expect(html).toContain("Waiting for the broker");
    expect(html).toContain("/rentals/apartment-1");
    expect(html).not.toContain("Confirmed by broker");
  });

  it("shows the persisted viewing status even when apartment details are hidden", async () => {
    loadUserViewings.mockResolvedValue({ status: "ok", value: [{
      id: "showing-private", apartmentId: "apt-private", apartmentTitle: null,
      neighborhood: null, scheduledAt: "2026-11-19T20:00:00Z", status: "confirmed",
    }] });
    const html = renderToStaticMarkup(await MyViewingsPage());
    expect(html).toContain("Confirmed");
    expect(html).toContain("Apartment details unavailable");
    expect(html).toContain("request is still saved");
    expect(html).not.toContain("View apartment details");
  });

  it("renders a retryable error, never an empty-history false claim", async () => {
    loadUserViewings.mockResolvedValue({ status: "error", message: "Could not load" });
    const html = renderToStaticMarkup(await MyViewingsPage());
    expect(html).toContain("Your viewings are temporarily unavailable");
    expect(html).toContain("Try again");
    expect(html).not.toContain("No linked viewings yet");
  });
});
