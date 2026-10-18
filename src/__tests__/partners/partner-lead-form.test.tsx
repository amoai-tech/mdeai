// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

import { PartnerLeadForm } from "@/components/partners/partner-lead-form";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

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

const PROPS = {
  testId: "venues-landing",
  variant: "cafe",
  signupHref: "/partners/signup?type=venue&category=cafe",
} as const;

let mounted: { container: HTMLDivElement; root: Root } | null = null;

afterEach(() => {
  if (mounted) {
    act(() => mounted!.root.unmount());
    mounted.container.remove();
    mounted = null;
  }
});

describe("PartnerLeadForm hydration guard", () => {
  it("server markup keeps submit disabled so a pre-hydration click cannot native-GET guest details", () => {
    const html = renderToStaticMarkup(<PartnerLeadForm {...PROPS} />);
    expect(html).toContain('data-testid="venues-landing-lead-submit"');
    expect(html).toMatch(/data-testid="venues-landing-lead-submit"[^>]*\bdisabled\b/);
  });

  it("enables submit once React has hydrated", async () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    let root!: Root;
    await act(async () => {
      root = createRoot(container);
      root.render(<PartnerLeadForm {...PROPS} />);
    });
    mounted = { container, root };
    const button = container.querySelector(
      '[data-testid="venues-landing-lead-submit"]',
    ) as HTMLButtonElement;
    expect(button.disabled).toBe(false);
  });
});
