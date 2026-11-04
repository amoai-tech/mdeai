// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { EventInterestButton } from "../event-interest-button";

vi.mock("next/navigation", () => ({
  usePathname: () => "/events/a1b2c3d4-0001-0001-0001-000000000003",
  useRouter: () => ({ refresh: vi.fn() }),
}));
vi.mock("@/app/events/[slug]/actions", () => ({ setEventInterest: vi.fn() }));

afterEach(cleanup);

describe("SAN-1620 S4 — follow is consent, and a guest is asked to sign in", () => {
  it("sends a guest to sign in and back to this exact event", () => {
    render(<EventInterestButton eventId="a1b2c3d4-0001-0001-0001-000000000003" following={false} signedIn={false} />);
    const link = screen.getByTestId("event-follow-signin");
    expect(link.getAttribute("href")).toBe(
      "/login?next=%2Fevents%2Fa1b2c3d4-0001-0001-0001-000000000003",
    );
  });

  it("offers a signed-in visitor the follow action", () => {
    render(<EventInterestButton eventId="a1b2c3d4-0001-0001-0001-000000000003" following={false} signedIn />);
    expect(screen.getByTestId("event-follow").textContent).toContain("Follow event updates");
    expect(screen.queryByTestId("event-follow-note")).toBeNull();
  });

  it("says Following and explains it is not a ticket", () => {
    render(<EventInterestButton eventId="a1b2c3d4-0001-0001-0001-000000000003" following signedIn />);
    const button = screen.getByTestId("event-follow");
    expect(button.textContent).toContain("Following");
    expect(button.getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByTestId("event-follow-note").textContent).toContain("not a ticket");
  });
});
