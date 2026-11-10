/**
 * SAN-1655 — the server owns the filter-control surface.
 *
 * Live testing showed the model will not author this tree: left free it answers
 * in text, forced it emits empty operations (the same failure SAN-1656 hit with
 * cards). This function builds the one valid, versioned `createSurface` the
 * runtime accepts, so the control appears deterministically and the model only
 * decides *when* it is relevant.
 *
 * The components resolve the renter's draft from the page and call the page's
 * real filter action; nothing here carries listing facts or model-authored UI.
 */
export const RENTAL_FILTER_CONTROL_TARGET = "rental-recommendations";
const A2UI_VERSION = "1.0";

export type RentalFilterControlOps = {
  target: string;
  operations: Array<Record<string, unknown>>;
};

export function buildRentalFilterControlOps(surfaceId: string): RentalFilterControlOps {
  return {
    target: RENTAL_FILTER_CONTROL_TARGET,
    operations: [
      {
        version: A2UI_VERSION,
        createSurface: {
          surfaceId,
          components: [
            { id: "root", component: "Column", children: ["beds", "apply"] },
            { id: "beds", component: "BedroomFilter", label: "Bedrooms" },
            { id: "apply", component: "ApplyFiltersButton", label: "Apply filters" },
          ],
        },
      },
    ],
  };
}
