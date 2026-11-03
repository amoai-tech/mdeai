// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { PartnerProfileContent } from "@/components/partners/partner-profile-content";

vi.mock("@/components/partners/partner-workspace-chat", () => ({
  PartnerWorkspaceChat: ({ userId, partnerId }: { userId: string; partnerId: string }) => (
    <div data-testid="business-chat" data-user-id={userId} data-partner-id={partnerId} />
  ),
}));
import type { PartnerProfileLoad } from "@/lib/partners/partner-profile-load";

vi.mock("next/link", () => ({
  default: ({
    href,
    children,
    ...props
  }: {
    href: string;
    children: React.ReactNode;
  }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

const NOR = {
  id: "11111111-1111-4111-8111-111111111111",
  type: "venue",
  status: "active",
  settings: { businessName: "Café Norte", description: "North" },
};
const SUR = {
  id: "22222222-2222-4222-8222-222222222222",
  type: "developer",
  status: "draft",
  settings: { businessName: "Café Sur" },
};

function renderProfile(profile: PartnerProfileLoad, basePath: string) {
  return render(<PartnerProfileContent profile={profile} basePath={basePath} userId="test-authenticated-user" />);
}

afterEach(cleanup);

describe("PartnerProfileContent (SAN-1579)", () => {
  it("builds business-selection links on the owning route", () => {
    const profile = {
      status: "selection_required" as const,
      options: [NOR, SUR],
    };

    renderProfile(profile, "/partners/profile");
    expect(
      screen.getByRole("link", { name: "Café Norte" }).getAttribute("href"),
    ).toBe("/partners/profile?partner=11111111-1111-4111-8111-111111111111");
    expect(
      screen.getByRole("link", { name: "Café Sur" }).getAttribute("href"),
    ).toBe("/partners/profile?partner=22222222-2222-4222-8222-222222222222");
    cleanup();

    renderProfile(profile, "/app/partners/profile");
    expect(
      screen.getByRole("link", { name: "Café Sur" }).getAttribute("href"),
    ).toBe("/app/partners/profile?partner=22222222-2222-4222-8222-222222222222");
  });

  it("marks the selected business and renders the shared editor", () => {
    renderProfile(
      { status: "loaded", partner: NOR, options: [NOR, SUR] },
      "/app/partners/profile",
    );
    expect(
      screen.getByRole("link", { name: "Café Norte" }).getAttribute("aria-current"),
    ).toBe("page");
    expect(screen.getByTestId("partner-profile-form")).toBeTruthy();
    expect(screen.getByTestId("business-chat").getAttribute("data-partner-id")).toBe(NOR.id);
    expect(screen.getByTestId("business-chat").getAttribute("data-user-id")).toBe("test-authenticated-user");
    expect(screen.getByRole("button", { name: /save profile/i })).toBeTruthy();
  });

  it("makes no claim about a missing profile for a database failure", () => {
    for (const status of ["error", "forbidden"] as const) {
      renderProfile({ status }, "/app/partners/profile");
      expect(screen.getByTestId("partner-profile-load-error")).toBeTruthy();
      expect(screen.getByRole("alert")).toBeTruthy();
      expect(screen.queryByTestId("partner-profile-missing")).toBeNull();
      expect(screen.queryByText(/create your partner profile/i)).toBeNull();
      expect(
        screen.getByRole("link", { name: /try again/i }).getAttribute("href"),
      ).toBe("/app/partners/profile");
      cleanup();
    }
  });

  it("keeps the real signup CTA for an account with no membership", () => {
    renderProfile({ status: "missing" }, "/partners/profile");
    expect(screen.getByTestId("partner-profile-missing")).toBeTruthy();
    expect(
      screen.getByRole("link", { name: /create/i }).getAttribute("href"),
    ).toBe("/partners/signup");
  });

  it("never renders a second main landmark", () => {
    const { container } = renderProfile(
      { status: "loaded", partner: NOR, options: [NOR] },
      "/partners/profile",
    );
    expect(container.querySelector("main")).toBeNull();
  });
});
