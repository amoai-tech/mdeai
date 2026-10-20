import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

const LONG_NAME = "La Pampa Parrilla Argentina - Laureles Medellín";

vi.mock("next/link", () => ({
  default: ({ href, children }: { href: string; children: React.ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}));
vi.mock("next/image", () => ({ default: () => <span data-image-mock="true" /> }));
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("unexpected notFound");
  },
}));
vi.mock("@/lib/restaurants/contest-public", () => ({
  getPublicContest: async () => ({
    status: "found",
    contest: {
      id: "00000000-0000-4000-8000-000000000001",
      slug: "sample",
      title: "Sample restaurant contest",
      description: null,
      status: "draft",
      startsAt: null,
      endsAt: null,
      coverUrl: null,
    },
    nominees: [{
      entityId: "00000000-0000-4000-8000-000000000002",
      restaurantId: "00000000-0000-4000-8000-000000000003",
      name: "La Pampa Parrilla Argentina - Laureles Medellín",
      neighborhood: "Laureles",
      imageUrl: null,
      category: null,
      audienceAccepted: 0,
      developmentTestTotal: 0,
      rank: null,
    }],
  }),
  contestState: () => "draft",
  contestWindowLabel: () => null,
}));

const { default: ContestDetailPage } = await import("../[id]/page");

async function render() {
  return renderToStaticMarkup(
    await ContestDetailPage({ params: Promise.resolve({ id: "sample" }) }),
  );
}

describe("contest detail layout regressions", () => {
  it("labels standings and the ballot as separate sections in the right order", async () => {
    const html = await render();
    const standings = html.indexOf('<section aria-labelledby="contest-standings-heading"');
    const ballot = html.indexOf('<section aria-labelledby="contest-nominees"');

    expect(standings).toBeGreaterThanOrEqual(0);
    expect(ballot).toBeGreaterThan(standings);
    expect(html).toContain('id="contest-standings-heading">Standings</h2>');
    expect(html).toContain('id="contest-nominees">Restaurants on the ballot</h2>');
    expect(html.indexOf('data-testid="contest-standings"')).toBeLessThan(ballot);
  });

  it("keeps full long restaurant names and contest-scoped links without clamping", async () => {
    const html = await render();

    expect(html).toContain(LONG_NAME);
    expect(html).toContain('class="break-words font-medium leading-snug"');
    expect(html).not.toContain("line-clamp-2");
    expect(html).toContain(
      '/restaurants/00000000-0000-4000-8000-000000000003?contest_id=00000000-0000-4000-8000-000000000001',
    );
  });
});
