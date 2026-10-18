// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

import { PartnerLeadForm } from "@/components/partners/partner-lead-form";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const hydration = vi.hoisted(() => ({ value: true }));
vi.mock("@/hooks/use-hydrated", () => ({
  useHydrated: () => hydration.value,
}));

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
    act(() => {
      mounted?.root.unmount();
    });
    mounted.container.remove();
    mounted = null;
  }
});

function mount(): HTMLDivElement {
  const container = document.createElement("div");
  document.body.appendChild(container);
  let root!: Root;
  act(() => {
    root = createRoot(container);
    root.render(<PartnerLeadForm {...PROPS} />);
  });
  mounted = { container, root };
  return container;
}

describe("PartnerLeadForm hydration guard", () => {
  it("keeps submit disabled before hydration so a click cannot native-GET guest details", () => {
    hydration.value = false;
    const container = mount();
    expect(
      container
        .querySelector('[data-testid="venues-landing-lead-submit"]')
        ?.matches(":disabled"),
    ).toBe(true);
  });

  it("enables submit once hydrated", () => {
    hydration.value = true;
    const container = mount();
    expect(
      container
        .querySelector('[data-testid="venues-landing-lead-submit"]')
        ?.matches(":disabled"),
    ).toBe(false);
  });
});
