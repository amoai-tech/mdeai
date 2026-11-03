import { describe, expect, it } from "vitest";
import { publishSlug } from "../../supabase/functions/approval-commit/publish-slug";

const PROPOSAL_A = "a1285000-0000-4000-8000-000000000011";
const PROPOSAL_B = "a1285000-0000-4000-8000-000000000012";

describe("publishSlug", () => {
  it("is stable for a retry of the same proposal", () => {
    expect(publishSlug("Salsa Night", PROPOSAL_A)).toBe(
      publishSlug("Salsa Night", PROPOSAL_A),
    );
  });

  it("gives two hosts publishing the same title different slugs", () => {
    const first = publishSlug("Salsa Night", PROPOSAL_A);
    const second = publishSlug("Salsa Night", PROPOSAL_B);
    expect(first).not.toBe(second);
    expect(first.startsWith("salsa-night-")).toBe(true);
    expect(second.startsWith("salsa-night-")).toBe(true);
  });

  it("produces a URL-safe slug the database accepts", () => {
    expect(publishSlug("Salsa Night · Medellín!", PROPOSAL_A)).toMatch(
      /^[a-z0-9]+(-[a-z0-9]+)*$/,
    );
  });

  it("normalizes accents and caps the total length", () => {
    const slug = publishSlug(
      "Fiesta de la Música Colombiana con Invitados Especiales y Más",
      PROPOSAL_A,
    );
    expect(slug.startsWith("fiesta-de-la-musica-colombiana")).toBe(true);
    expect(slug.length).toBeLessThanOrEqual(80);
  });

  it("does not leave a double hyphen when the 55-character cut lands on a space", () => {
    // Base slug before the cut ends at "...invitada-y-"; without the post-slice
    // trim the suffix produces "...invitada-y--<suffix>", which the SQL slug
    // guard rejects with INVALID_EVENT_DRAFT.
    const slug = publishSlug(
      "Una Noche de Salsa en Medellín con Orquesta Invitada y Clase de Baile",
      PROPOSAL_A,
    );
    expect(slug).not.toContain("--");
    expect(slug.endsWith("-000000000011")).toBe(true);
    expect(slug).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
  });

  it("keeps every long-title boundary URL-safe", () => {
    const titles = [
      "Una Noche de Salsa en Medellín con Orquesta Invitada y Clase de Baile",
      "Fiesta de la Música Colombiana con Invitados Especiales y Más",
      "Salsa Night en Medellín con Orquesta Invitada y Clase de Baile",
      "Festival de Salsa y Música Colombiana con Invitados Especiales y Más",
    ];
    for (const title of titles) {
      const slug = publishSlug(title, PROPOSAL_A);
      expect(slug).not.toContain("--");
      expect(slug).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
    }
  });

  it("falls back to an event slug for a title with no latin characters", () => {
    expect(publishSlug("東京", PROPOSAL_A)).toMatch(/^event-[a-z0-9]+$/);
  });
});
