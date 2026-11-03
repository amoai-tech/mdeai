import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { ReactElement } from "react";

vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));
vi.mock("@/app/admin/contests/actions", () => ({
  createContestAction: async () => undefined,
}));

const listAdminContests = vi.fn();
vi.mock("@/lib/restaurants/contest-admin", () => ({
  listAdminContests: () => listAdminContests(),
}));

const { ContestAdminList } = await import("../contest-admin-list");

function summary(id: string, title: string) {
  return {
    id,
    slug: "slug-" + id,
    title,
    status: "draft" as const,
    kind: "restaurant",
    starts_at: "2026-10-20T09:00:00Z",
    ends_at: "2026-10-30T18:00:00Z",
    created_at: "2026-10-20T09:00:00Z",
    entries: 2,
    linked: 1,
  };
}

async function render(base: "app" | "admin"): Promise<string> {
  const element = (await ContestAdminList({ userId: "user-1", base })) as ReactElement;
  return renderToStaticMarkup(element);
}

describe("shared contest admin list", () => {
  it("links rows and the create form to /app/contests for the app adapter", async () => {
    listAdminContests.mockResolvedValue([summary("abc", "Coffee Week")]);
    const html = await render("app");

    expect(html).toContain('href="/app/contests/abc"');
    expect(html).toContain('name="base" value="app"');
    expect(html).toContain('data-testid="contest-create-submit"');
    expect(html).toContain("Coffee Week");
    // The shared body never hardcodes the legacy destination.
    expect(html).not.toContain('href="/admin/contests/abc"');
  });

  it("keeps the legacy /admin/contests destination for the legacy page", async () => {
    listAdminContests.mockResolvedValue([summary("abc", "Coffee Week")]);
    const html = await render("admin");

    expect(html).toContain('href="/admin/contests/abc"');
    expect(html).toContain('name="base" value="admin"');
    expect(html).not.toContain('href="/app/contests/abc"');
  });

  it("shows honest empty copy rather than a fabricated row", async () => {
    listAdminContests.mockResolvedValue([]);
    const html = await render("app");
    expect(html).toContain('data-testid="contests-empty"');
    expect(html).toContain("No restaurant contests yet");
  });
});
