// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { validateOperation } from "@copilotkit/shared";
import { MdeDashboardRenderProvider } from "@/components/copilot/a2ui/mde-dashboard-surface";
import { mdeUI } from "@/components/copilot/a2ui/mde-ui-catalog";
import type { BrokerListingDetail } from "@/lib/rentals/broker-listing-detail";
import { buildBrokerListingGridOperations } from "@/lib/rentals/broker-listings-ui";
import { RentalsListingsGrid } from "../rentals-listings-grid";

const key = "77777777-7777-4777-8777-777777777777";
const listing: BrokerListingDetail = {
  id: "11111111-1111-4111-8111-111111111111",
  title: "Laureles apartment", neighborhood: "Laureles",
  listingWorkflowStatus: "published", landlordId: "profile-a",
  bedrooms: 2, bathrooms: 1, priceMonthly: 2400000, currency: "COP",
  address: null, description: null, images: [], latitude: null, longitude: null,
  publishedAt: null, amenities: [],
};
const draft: BrokerListingDetail = {
  ...listing, id: "22222222-2222-4222-8222-222222222222", title: "Unpriced draft",
  listingWorkflowStatus: "draft", priceMonthly: null, images: [],
};
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("SAN-1711 official listing grid", () => {
  it("validates official components, real record identity, and restricted stored media", () => {
    const row = { ...listing, images: ["https://untrusted.invalid/a.jpg", "https://images.unsplash.com/photo-1"] };
    const schema = mdeUI.components.get("EntityCard")?.props;
    const accepts = (image: string) => schema instanceof z.ZodObject && schema.safeParse({ title: "Listing", image }).success;
    const ops = buildBrokerListingGridOperations([row, draft], row.id, key, accepts);
    expect(validateOperation(ops[0], { manifest: { catalogId: mdeUI.id, components: mdeUI.manifestComponents }, knownSurfaces: new Set() })).toEqual({ ok: true });
    const nodes = ops[0].createSurface.components;
    const entity = nodes.find(n => n.id === `listing-${row.id}-entity`);
    expect(entity).toMatchObject({ component: "EntityCard", image: row.images[1], meta: "COP $2,400,000/mo" });
    expect(nodes.find(n => n.id === `listing-${draft.id}-entity`)).not.toHaveProperty("image");
    expect(nodes.find(n => n.id === `listing-${row.id}-manage`)).toMatchObject({
      onClick: { functionCall: { "@call": "brokerListingSelect", args: { rendererKey: key, listingId: row.id } } },
    });
    expect(mdeUI.functions.get("brokerListingSelect")).toMatchObject({ allowedCallers: "rendererOnly", requiresUserActivation: true });
  });
  it("renders the official surface without AI and selects the exact existing listing", async () => {
    const onSelect = vi.fn();
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    render(<MdeDashboardRenderProvider><RentalsListingsGrid listings={[listing, draft]} selectedId={null} onSelect={onSelect} /></MdeDashboardRenderProvider>);
    const surface = await screen.findByTestId("mde-surface-broker-listings-grid");
    expect(within(surface).getByText("COP $2,400,000/mo")).toBeTruthy();
    expect(within(surface).getByText(/data pending/i)).toBeTruthy();
    fireEvent.click(within(surface).getByRole("button", { name: "Manage Unpriced draft" }));
    await waitFor(() => expect(onSelect).toHaveBeenCalledWith(draft.id));
    expect(fetch).not.toHaveBeenCalled();
  });
});
