import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

const LONG_NAME = "La Pampa Parrilla Argentina - Laureles Medellín";
const CONTEST_ID = "00000000-0000-4000-8000-000000000001";
const RESTAURANT_ID = "00000000-0000-4000-8000-000000000003";

vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));
vi.mock("next/image", () => ({ default: () => <span data-image-mock="true" /> }));
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("unexpected notFound");
  },
}));
vi.mock("server-only", () => ({}));

type Fixture = {
  state: "draft" | "live" | "closed";
  nominees: unknown[];
  description?: string;
};

function nominee(overrides: Record<string, unknown> = {}) {
  return {
    entityId: "00000000-0000-4000-8000-000000000002",
    restaurantId: RESTAURANT_ID,
    name: LONG_NAME,
    neighborhood: "Laureles",
    imageUrl: null,
    category: null,
    audienceAccepted: 0,
    developmentTestTotal: 0,
    rank: null,
    latitude: null,
    longitude: null,
    ...overrides,
  };
}

const FIXTURES: Record<string, Fixture> = {
  "draft-contest": { state: "draft", nominees: [nominee()] },
  "open-contest": {
    state: "live",
    nominees: [nominee({ category: "Best service", rank: 1, audienceAccepted: 4 })],
  },
  "closed-contest": { state: "closed", nominees: [nominee()] },
  "no-nominees": { state: "live", nominees: [] },
};

vi.mock("@/lib/restaurants/contest-public", async (importOriginal) => {
  // The presentation rules (effective state, date formatting) stay real: they are the thing
  // under test. Only the server read is replaced.
  const actual = await importOriginal<Record<string, unknown>>();
  return {
    ...actual,
    getPublicContest: async (ref: string) => {
      const fixture = FIXTURES[ref];
      if (!fixture) return { status: "not_found" as const };
      const startsAt = "2026-10-18T15:00:00Z";
      const endsAt = fixture.state === "closed" ? "2026-10-19T15:00:00Z" : "2027-02-15T15:00:00Z";
      return {
        status: "found" as const,
        contest: {
          id: CONTEST_ID,
          slug: "sample",
          title: "Sample restaurant contest",
          description:
            fixture.description === undefined
              ? "A description the organizer actually published."
              : fixture.description,
          status: fixture.state,
          startsAt,
          endsAt,
          coverUrl: null,
        },
        nominees: fixture.nominees,
      };
    },
  };
});

const { default: ContestDetailPage } = await import("../[id]/page");

async function render(id: string) {
  return renderToStaticMarkup(
    await ContestDetailPage({ params: Promise.resolve({ id }) }),
  );
}

describe("contest detail layout regressions", () => {
  it("gives the contest a real hero: title, status, dates and description", async () => {
    const html = await render("draft-contest");

    expect(html).toContain("Sample restaurant contest");
    expect(html).toContain('data-testid="contest-title"');
    expect(html).toContain('data-state="draft"');
    expect(html).toContain('data-testid="contest-description"');
    expect(html).toContain("A description the organizer actually published.");
    // Dates are formatted in Medellín time, never the server's own zone.
    expect(html).toContain("Oct 18, 2026");
    expect(html).toContain("Feb 15, 2027");
    expect(html).toContain(`data-contest-id="${CONTEST_ID}"`);
  });

  it("says a draft is not open for voting instead of showing a live ballot", async () => {
    const html = await render("draft-contest");
    expect(html).toContain('data-testid="contest-draft-note"');
    expect(html).toContain("not open for voting yet");
    expect(html).toContain('data-testid="contest-vote-guidance"');
    expect(html).toContain("One ballot per account, per contest.");
  });

  it("tells a visitor what is actually happening now in open and closed contests", async () => {
    const open = await render("open-contest");
    expect(open).not.toContain('data-testid="contest-draft-note"');
    expect(open).toContain("Open a participating restaurant");

    const closed = await render("closed-contest");
    expect(closed).not.toContain('data-testid="contest-draft-note"');
    expect(closed).toContain("Voting closed on");
  });

  it("keeps the ballot and the provisional standings as separate, ordered sections", async () => {
    const html = await render("open-contest");
    const ballot = html.indexOf('aria-labelledby="contest-nominees-heading"');
    const standings = html.indexOf('aria-labelledby="contest-standings-heading"');

    expect(ballot).toBeGreaterThanOrEqual(0);
    expect(standings).toBeGreaterThan(ballot);
    expect(html).toMatch(/id="contest-nominees-heading"[^>]*>\s*Restaurants on the ballot/);
    expect(html).toMatch(/id="contest-standings-heading"[^>]*>\s*Standings/);
    expect(html).toContain('data-testid="contest-standings"');
    expect(html).toContain('data-testid="standings-summary"');
    // Accepted audience votes are shown; test votes stay separate and are never added in.
    expect(html).toContain("<span class=\"font-semibold\">4</span> accepted audience vote");
  });

  it("never invents a leader or winner at zero accepted votes", async () => {
    const html = await render("draft-contest");
    expect(html).toContain("No accepted votes yet — there is no leader or winner.");
    expect(html).not.toContain("Provisional");
  });

  it("keeps full long restaurant names and contest-scoped links without clamping", async () => {
    const html = await render("open-contest");

    expect(html).toContain(LONG_NAME);
    expect(html).toContain("/restaurants/" + RESTAURANT_ID + "?contest_id=" + CONTEST_ID);
    expect(html).toContain('data-testid="nominee-name"');
    expect(html).not.toContain("line-clamp-2");
    // A real category and a real place are rendered; the card owns neither when absent.
    expect(html).toContain("Best service");
    expect(html).toContain('data-testid="nominee-rank"');
  });

  it("shows an honest empty ballot when the organizer added no restaurants", async () => {
    const html = await render("no-nominees");
    expect(html).toContain('data-testid="contest-nominees-empty"');
    expect(html).not.toContain('data-testid="contest-nominees"');
  });
});
