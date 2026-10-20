import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { ReactElement } from "react";

vi.mock("next/link", () => ({
  default: ({ href, children }: { href: string; children: React.ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}));
// No <img>: this suite renders to a string, and the repo lints with --max-warnings 0.
vi.mock("next/image", () => ({
  default: () => <span data-mock-image="true" />,
}));
vi.mock("server-only", () => ({}));

const listPublicContests = vi.fn();
vi.mock("@/lib/restaurants/contest-public", async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return { ...actual, listPublicContests: () => listPublicContests() };
});

const { default: ContestsPage } = await import("../page");

function contest(slug: string, title: string) {
  return {
    id: "id-" + slug,
    slug,
    title,
    description: null,
    status: "draft" as const,
    startsAt: null,
    endsAt: null,
    coverUrl: null,
    nominees: 3,
  };
}

async function render(): Promise<string> {
  const element = (await ContestsPage()) as ReactElement;
  return renderToStaticMarkup(element);
}

describe("contests page states", () => {
  it("shows a truthful empty state when no contest exists", async () => {
    listPublicContests.mockResolvedValue({ status: "ok", contests: [] });
    const html = await render();
    expect(html).toContain("No restaurant contests yet");
    expect(html).not.toContain("data-featured");
  });

  it("features a single contest instead of leaving an empty grid column", async () => {
    listPublicContests.mockResolvedValue({
      status: "ok",
      contests: [contest("only-one", "Only One")],
    });
    const html = await render();
    expect(html).toContain('data-featured="true"');
    expect(html).toContain("contest-card-only-one");
    expect(html).not.toContain('data-testid="contests-list"');
  });

  it("uses the responsive grid for more than one contest", async () => {
    listPublicContests.mockResolvedValue({
      status: "ok",
      contests: [contest("first", "First"), contest("second", "Second")],
    });
    const html = await render();
    expect(html).toContain('data-testid="contests-list"');
    expect(html).not.toContain("data-featured");
    expect(html).toContain("contest-card-first");
    expect(html).toContain("contest-card-second");
  });

  it("says the failure is temporary, not an empty list", async () => {
    listPublicContests.mockResolvedValue({ status: "error" });
    const html = await render();
    expect(html).toContain("temporary problem");
    expect(html).toContain('data-testid="contests-error"');
  });
});