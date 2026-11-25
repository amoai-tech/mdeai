import type { BrokerListingDetail } from "./broker-listing-detail";
import { formatBrokerMonthlyRent } from "./format-broker-rent";

export const BROKER_LISTINGS_SURFACE_ID = "broker-listings-grid";

const statusLabel: Record<BrokerListingDetail["listingWorkflowStatus"], string> = {
  draft: "Draft",
  ready_for_review: "Ready for review",
  published: "Published",
  paused: "Paused",
  rejected: "Rejected",
};

/** SAN-1711: deterministic official cards. Selection remains in the existing
 * inventory shell; no model-generated data or new inventory/map service. */
export function buildBrokerListingGridOperations(
  listings: readonly BrokerListingDetail[],
  selectedId: string | null,
  rendererKey: string,
  acceptsImage: (url: string) => boolean,
) {
  const components: Record<string, unknown>[] = [
    { id: "root", component: "Grid", gap: 3, minChildWidth: "240px", children: listings.map((row) => `listing-${row.id}`) },
  ];
  for (const row of listings) {
    const id = `listing-${row.id}`;
    const image = row.images.find(acceptsImage);
    const title = row.title.trim() || "Untitled listing";
    const selected = selectedId === row.id;
    components.push(
      { id, component: "Card", variant: "outline", gap: 2, children: [`${id}-entity`, `${id}-facts`, `${id}-manage`] },
      {
        id: `${id}-entity`, component: "EntityCard", layout: "horizontal",
        title, subtitle: row.neighborhood.trim() || "Neighborhood not specified",
        meta: formatBrokerMonthlyRent(row.priceMonthly, row.currency),
        ...(image ? { image } : {}),
        badge: { label: statusLabel[row.listingWorkflowStatus], color: row.listingWorkflowStatus === "published" ? "success" : "secondary" },
      },
      { id: `${id}-facts`, component: "Caption", text: `${row.bedrooms ?? "—"} BR · ${row.bathrooms ?? "—"} BA${image ? "" : " · No displayable photo"}` },
      {
        id: `${id}-manage`, component: "Button", size: "sm",
        variant: selected ? "default" : "soft", label: `Manage ${title}`,
        onClick: { functionCall: { "@call": "brokerListingSelect", args: { rendererKey, listingId: row.id } } },
      },
    );
  }
  return [{ version: "1.0", createSurface: { surfaceId: BROKER_LISTINGS_SURFACE_ID, components } }];
}
