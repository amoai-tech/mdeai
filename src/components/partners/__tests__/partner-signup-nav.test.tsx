// @vitest-environment jsdom
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { PartnerSignupNav } from "@/components/partners/partner-signup-nav";

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

describe("PartnerSignupNav", () => {
  it("preserves draft on back-to-picker link", () => {
    const html = renderToStaticMarkup(
      <PartnerSignupNav
        showBackToPicker
        pickerHref="/partners/signup?draft=22222222-2222-4222-a222-222222222222"
      />,
    );
    expect(html).toContain(
      'href="/partners/signup?draft=22222222-2222-4222-a222-222222222222"',
    );
  });

  it("keeps mobile navigation compact and preserves both destinations", () => {
    const root = document.createElement("div");
    root.innerHTML = renderToStaticMarkup(<PartnerSignupNav showBackToPicker />);

    const back = root.querySelector('a[aria-label="All partner types"]');
    expect(back?.getAttribute("href")).toBe("/partners/signup");
    expect(back?.classList.contains("shrink-0")).toBe(true);
    const backLabel = back?.querySelector("span");
    expect(backLabel?.textContent).toBe("All partner types");
    expect(backLabel?.classList.contains("hidden")).toBe(true);
    expect(backLabel?.classList.contains("sm:inline")).toBe(true);

    const explore = root.querySelector('a[href="/chat"]');
    expect(explore?.classList.contains("hidden")).toBe(true);
    expect(explore?.classList.contains("sm:inline-flex")).toBe(true);
    expect(root.querySelector('a[href="/login"]')?.textContent).toContain("Sign in");
  });

  it("sign-in uses next redirect when provided", () => {
    const html = renderToStaticMarkup(
      <PartnerSignupNav
        signInHref="/login?next=%2Fpartners%2Fsignup%3Ftype%3Dhost"
      />,
    );
    expect(html).toContain('href="/login?next=%2Fpartners%2Fsignup%3Ftype%3Dhost"');
  });
});
