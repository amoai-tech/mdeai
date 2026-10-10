import { z } from "zod";

/**
 * The New Projects HTTP search contract, kept free of server/Mastra imports so the browser fast
 * path can validate a response at its boundary instead of trusting a cast.
 */
export const newProjectCardSchema = z.object({
  slug: z.string(),
  name: z.string(),
  neighborhood: z.string().nullable(),
  sourceOwner: z.string().nullable(),
  /** "From COP 575,000,000" / "COP 370,406,379 – 834,843,174" / "Not published". */
  priceLabel: z.string(),
  priceKnown: z.boolean(),
  bedroomsLabel: z.string().nullable(),
  /** "Delivery 2027" / "Delivery: Estimada" / "Delivery date not published". */
  deliveryLabel: z.string(),
  statusLabel: z.string().nullable(),
  visLabel: z.string().nullable(),
  unitTypeCount: z.number(),
  /** "Verified 6 Oct 2026" / "Not yet verified". */
  verifiedLabel: z.string(),
  detailUrl: z.string(),
  primarySourceUrl: z.string().nullable(),
  primarySourceCheckedLabel: z.string().nullable(),
  /** Facts a source did not publish — the caller must not fill these in. */
  unknownFields: z.array(z.string()),
});

export type NewProjectCard = z.infer<typeof newProjectCardSchema>;

/** The full search envelope returned by POST /api/new-projects/search. */
export const newProjectSearchEnvelopeSchema = z.object({
  results: z.array(newProjectCardSchema),
  totalPublished: z.number(),
  returned: z.number(),
  note: z.string(),
});

export type NewProjectSearchEnvelope = z.infer<typeof newProjectSearchEnvelopeSchema>;
