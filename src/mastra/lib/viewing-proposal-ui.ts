/**
 * SAN-1658 — the server owns the viewing-proposal surface.
 *
 * Live testing showed the model will not author this tree reliably: it sent the
 * operations as a malformed JSON string and invented a calendar date. The model
 * only decides *when* a proposal is relevant and *which* apartment; this builds
 * the one valid, versioned `createSurface` the runtime accepts. The component
 * resolves every listing fact from the current authorized results and writes
 * nothing; the existing review form stays the only submit.
 */
export const VIEWING_PROPOSAL_TARGET = "rental-recommendations";
/** One stable surface id: a newer request replaces the older proposal instead of stacking. */
export const VIEWING_PROPOSAL_SURFACE_ID = "viewing-proposal";
const A2UI_VERSION = "1.0";

export type ViewingProposalInput = {
  listingId: string;
  /** YYYY-MM-DD, only when the renter stated it. */
  date?: string;
  /** HH:mm 24-hour, Medellín, only when the renter stated it. */
  time?: string;
};

export function buildViewingProposalOps(
  input: ViewingProposalInput,
  surfaceId: string = VIEWING_PROPOSAL_SURFACE_ID,
  options: { replace?: boolean } = {},
) {
  return {
    target: VIEWING_PROPOSAL_TARGET,
    operations: [
      // A2UI rejects createSurface for an id that already exists, so a newer request
      // deletes the previous proposal first and re-creates it in the same call.
      ...(options.replace ? [{ version: A2UI_VERSION, deleteSurface: { surfaceId } }] : []),
      {
        version: A2UI_VERSION,
        createSurface: {
          surfaceId,
          components: [
            { id: "root", component: "Column", children: ["proposal"] },
            {
              id: "proposal",
              component: "ViewingProposal",
              listingId: input.listingId,
              ...(input.date ? { date: input.date } : {}),
              ...(input.time ? { time: input.time } : {}),
            },
          ],
        },
      },
    ],
  };
}
