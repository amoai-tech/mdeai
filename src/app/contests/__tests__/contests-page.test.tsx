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

const { ContestDirectory, DirectoryResults, normalizeFilter } = await import(
  "@/components/restaurants/contest-directory",
);

function contest(slug: string, title: string, overrides: Record<string, unknown> = {}) {
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
    ...overrides,
  };
}

async function renderPage(params: { status?: string | string[] } = {}): Promise<string> {
  const element = (await ContestDirectory({ status: params.status })) as ReactElement;
  return renderToStaticMarkup(element);
}

async function renderResults(filter: string): Promise<string> {
  const element = (await DirectoryResults({
    filter: normalizeFilter(filter),
  })) as ReactElement;
  return renderToStaticMarkup(element);
}

describe("contests page — shell and loading", () => {
  it("renders the editorial hero and a skeleton while the canonical read resolves", async () => {
    // A promise that never settles: the page must still stream its shell, never a blank screen.
    listPublicContests.mockReturnValue(new Promise(() => {}));
    const html = await renderPage();

    expect(html).toContain("A new way to celebrate Medellín");
    expect(html).toContain('href="#contests"');
    expect(html).toContain('data-testid="contests-loading"');
    expect(html).toContain('data-testid="contest-filters"');
    expect(html).not.toContain('data-testid="contests-error"');
  });

  it("falls back to the unfiltered view for an unknown filter value", () => {
    expect(normalizeFilter("not-a-state")).toBe("all");
    expect(normalizeFilter(undefined)).toBe("all");
    expect(normalizeFilter(["draft", "open"])).toBe("draft");
  });
});

describe("contests directory states", () => {
  it("shows a truthful empty state when no contest exists", async () => {
    listPublicContests.mockResolvedValue({ status: "ok", contests: [] });
    const html = await renderResults("all");
    expect(html).toContain("No restaurant contests yet");
    expect(html).not.toContain("data-featured");
    // An empty directory still offers the real next step.
    expect(html).toContain('href="/restaurants"');
  });

  it("features a single contest instead of leaving an empty grid column", async () => {
    listPublicContests.mockResolvedValue({
      status: "ok",
      contests: [contest("only-one", "Only One")],
    });
    const html = await renderResults("all");
    expect(html).toContain('data-featured="true"');
    expect(html).toContain("contest-card-only-one");
    expect(html).not.toContain('data-testid="contests-list"');
    expect(html).toContain('data-testid="contest-name"');
    expect(html).toContain('data-testid="contest-featured-media"');
    expect(html).toContain('data-testid="contest-featured-copy"');
  });

  it("uses the responsive grid for more than one contest", async () => {
    listPublicContests.mockResolvedValue({
      status: "ok",
      contests: [contest("first", "First"), contest("second", "Second")],
    });
    const html = await renderResults("all");
    expect(html).toContain('data-testid="contests-list"');
    expect(html).not.toContain("data-featured");
    expect(html).toContain("contest-card-first");
    expect(html).toContain("contest-card-second");
  });

  it("says the failure is temporary, not an empty list", async () => {
    listPublicContests.mockResolvedValue({ status: "error" });
    const html = await renderResults("all");
    expect(html).toContain("temporary problem");
    expect(html).toContain('data-testid="contests-error"');
    expect(html).toContain('data-testid="contests-retry"');
    expect(html).not.toContain('data-testid="contests-empty"');
  });

  it("filters by real effective state", async () => {
    listPublicContests.mockResolvedValue({
      status: "ok",
      contests: [
        contest("draft-one", "Draft One", { status: "draft" }),
        contest("live-one", "Live One", {
          status: "live",
          startsAt: "2026-10-01T15:00:00Z",
          endsAt: "2027-02-15T15:00:00Z",
        }),
      ],
    });

    const openView = await renderResults("open");
    expect(openView).toContain("contest-card-live-one");
    expect(openView).not.toContain("contest-card-draft-one");

    const draftView = await renderResults("draft");
    expect(draftView).toContain("contest-card-draft-one");
    expect(draftView).not.toContain("contest-card-live-one");
  });

  it("explains an empty filter instead of pretending there are no contests", async () => {
    listPublicContests.mockResolvedValue({
      status: "ok",
      contests: [contest("draft-one", "Draft One", { status: "draft" })],
    });
    const html = await renderResults("closed");
    expect(html).toContain('data-testid="contests-filter-empty"');
    expect(html).toContain("No contest has finished yet.");
    expect(html).not.toContain('data-testid="contests-empty"');
  });

  it("labels every card with a status that does not rely on colour alone", async () => {
    listPublicContests.mockResolvedValue({
      status: "ok",
      contests: [contest("draft-one", "Draft One", { status: "draft" })],
    });
    const html = await renderResults("all");
    expect(html).toContain('data-state="draft"');
    expect(html).toContain("Draft");
  });
});
