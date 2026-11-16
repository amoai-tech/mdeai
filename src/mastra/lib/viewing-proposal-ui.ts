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
const A2UI_VERSION = "1.0";

export type ViewingProposalInput = {
  listingId: string;
  /** YYYY-MM-DD, only when the renter stated it. */
  date?: string;
  /** HH:mm 24-hour, Medellín, only when the renter stated it. */
  time?: string;
};

export function buildViewingProposalOps(input: ViewingProposalInput, surfaceId: string) {
  return {
    target: VIEWING_PROPOSAL_TARGET,
    operations: [
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
