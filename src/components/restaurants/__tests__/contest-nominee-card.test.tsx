import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { PublicNominee } from "@/lib/restaurants/contest-public";

vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));
vi.mock("next/image", () => ({ default: () => <span data-image-mock="true" /> }));

const { ContestNomineeCard } = await import("../contest-nominee-card");

function nominee(overrides: Partial<PublicNominee> = {}): PublicNominee {
  return {
    entityId: "entity-1",
    restaurantId: "restaurant-1",
    name: "Carmen",
    neighborhood: "El Poblado",
    imageUrl: null,
    category: null,
    audienceAccepted: 0,
    developmentTestTotal: 0,
    rank: null,
    latitude: 6.209964,
    longitude: -75.565669,
    ...overrides,
  };
}

function render(value: PublicNominee) {
  return renderToStaticMarkup(
    <ul>
      <ContestNomineeCard contestId="contest-1" nominee={value} />
    </ul>,
  );
}

describe("contest nominee card", () => {
  it("links to the exact restaurant and carries the contest id", () => {
    const html = render(nominee());
    expect(html).toContain('href="/restaurants/restaurant-1?contest_id=contest-1"');
  });

  it("uses the brand placeholder instead of a broken photo", () => {
    const html = render(nominee());
    expect(html).toContain('data-testid="nominee-photo-placeholder"');
    expect(html).not.toContain("data-image-mock");
    expect(html).toContain('data-testid="nominee-name">Carmen');
    expect(html).toContain("El Poblado");
  });

  it("never turns a zero tally into a rank or a fabricated vote count", () => {
    const html = render(nominee({ audienceAccepted: 0, developmentTestTotal: 0, rank: null }));
    expect(html).toContain("No audience votes yet");
    expect(html).not.toContain("nominee-rank");
    expect(html).not.toContain("development test vote");
  });

  it("shows a real place and real category only when the read supplied them", () => {
    const html = render(
      nominee({ audienceAccepted: 7, developmentTestTotal: 2, rank: 2, category: "Best service" }),
    );
    expect(html).toContain('data-testid="nominee-rank"');
    expect(html).toContain("#2");
    expect(html).toContain("Best service");
    expect(html).toContain("<span class=\"font-semibold text-foreground\">7</span>");
    expect(html).toContain("2 development test votes");
  });

  it("keeps development test votes separate from the audience count", () => {
    const html = render(nominee({ audienceAccepted: 0, developmentTestTotal: 1 }));
    expect(html).toContain("No audience votes yet");
    expect(html).toContain("1 development test vote");
  });
});
