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

const { ContestNomineeGallery } = await import("../contest-nominee-gallery");

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

describe("contest nominee gallery", () => {
  it("renders the ballot for every nominee", () => {
    const html = renderToStaticMarkup(
      <ContestNomineeGallery
        contestId="contest-1"
        nominees={[nominee(), nominee({ entityId: "entity-2", restaurantId: "restaurant-2" })]}
      />,
    );
    expect(html).toContain('data-testid="contest-nominees"');
    expect(html).toContain("nominee-card-entity-1");
    expect(html).toContain("nominee-card-entity-2");
  });

  it("omits the map entirely when no nominee has a real coordinate pair", () => {
    const html = renderToStaticMarkup(
      <ContestNomineeGallery
        contestId="contest-1"
        nominees={[nominee({ latitude: null, longitude: null })]}
      />,
    );
    expect(html).not.toContain('data-testid="contest-map"');
    // The cards never depend on the map.
    expect(html).toContain("nominee-card-entity-1");
  });

  it("counts only the nominees that can actually be pinned", () => {
    const html = renderToStaticMarkup(
      <ContestNomineeGallery
        contestId="contest-1"
        nominees={[
          nominee(),
          nominee({ entityId: "entity-2", restaurantId: "restaurant-2", latitude: null, longitude: null }),
        ]}
      />,
    );
    expect(html).toContain('data-testid="contest-map"');
    expect(html).toContain("1 of 2 restaurants have a location.");
    // The unpinned restaurant stays in the list.
    expect(html).toContain("nominee-card-entity-2");
  });
});
