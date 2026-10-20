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

  it("falls back to an event slug for a title with no latin characters", () => {
    expect(publishSlug("東京", PROPOSAL_A)).toMatch(/^event-[a-z0-9]+$/);
  });
});
