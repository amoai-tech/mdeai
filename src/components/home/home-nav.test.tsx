// @vitest-environment jsdom
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { HomeNav } from "@/components/home/home-nav";

const auth = vi.hoisted(() => ({ signedIn: false, loading: false }));

vi.mock("@/hooks/use-session", () => ({
  useSession: () => ({
    user: auth.signedIn ? { id: "test-user" } : null,
    loading: auth.loading,
  }),
}));

vi.mock("next/link", () => ({
  default: ({ href, children, ...props }: {
    href: string;
    children: React.ReactNode;
  }) => <a href={href} {...props}>{children}</a>,
}));

vi.mock("@/components/ui/sheet", () => ({
  Sheet: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  SheetTrigger: ({ children, ...props }: { children: React.ReactNode }) =>
    <button {...props}>{children}</button>,
  SheetContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

function renderNav({ signedIn = false, loading = false } = {}) {
  auth.signedIn = signedIn;
  auth.loading = loading;
  return renderToStaticMarkup(<HomeNav />);
}

describe("HomeNav authentication links", () => {
  it("shows real login and signup destinations in both desktop and mobile navigation", () => {
    const html = renderNav();
    expect(html.match(/href="\/login"/g)).toHaveLength(2);
    expect(html.match(/href="\/signup"/g)).toHaveLength(2);
    expect(html).toContain("Log in");
    expect(html).toContain("Sign up");
    expect(html).toContain("lg:hidden");
    expect(html).toContain("lg:flex");
  });

  it("offers the account workspace instead to signed-in users", () => {
    const html = renderNav({ signedIn: true });
    expect(html.match(/href="\/app"/g)).toHaveLength(2);
    expect(html).not.toContain('href="/login"');
    expect(html).not.toContain('href="/signup"');
  });

  it("does not flash guest links while the session is loading", () => {
    const html = renderNav({ loading: true });
    expect(html).not.toContain('href="/login"');
    expect(html).not.toContain('href="/signup"');
    expect(html).not.toContain('href="/app"');
  });
});
