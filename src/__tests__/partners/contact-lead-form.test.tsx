// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ContactLeadForm } from "@/components/partners/contact-lead-form";

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

let mounted: { container: HTMLDivElement; root: Root } | null = null;

afterEach(() => {
  if (mounted) {
    act(() => mounted!.root.unmount());
    mounted.container.remove();
    mounted = null;
  }
});

describe("ContactLeadForm hydration guard", () => {
  it("keeps submit disabled in server markup so a pre-hydration click cannot native-GET guest details", () => {
    const html = renderToStaticMarkup(<ContactLeadForm />);
    expect(html).toContain('data-testid="contact-submit"');
    expect(html).toMatch(/data-testid="contact-submit"[^>]*\bdisabled\b/);
    // The form has no action/method, so a native submit would GET these fields
    // into the URL: name, email, partnerType, businessName, message.
    expect(html).toContain('id="contact-email"');
  });

  it("enables submit once React has hydrated", async () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    let root!: Root;
    await act(async () => {
      root = createRoot(container);
      root.render(<ContactLeadForm />);
    });
    mounted = { container, root };

    const button = container.querySelector(
      '[data-testid="contact-submit"]',
    ) as HTMLButtonElement;
    expect(button.disabled).toBe(false);
  });
});
