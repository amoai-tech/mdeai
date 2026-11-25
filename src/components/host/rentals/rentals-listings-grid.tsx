"use client";

import Image from "next/image";
import { z } from "zod";
import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { useGenerativeUIFunction } from "@copilotkit/react-core/v2/generative-ui";
import { MdeDashboardSurface } from "@/components/copilot/a2ui/mde-dashboard-surface";
import { mdeUI } from "@/components/copilot/a2ui/mde-ui-catalog";
import { BROKER_LISTINGS_SURFACE_ID, buildBrokerListingGridOperations } from "@/lib/rentals/broker-listings-ui";
import type { BrokerListingDetail } from "@/lib/rentals/broker-listing-detail";
import { formatBrokerMonthlyRent } from "@/lib/rentals/format-broker-rent";
import { ListingWorkflowPill } from "@/components/host/rentals/listing-workflow-pill";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

type RentalsListingsGridProps = {
  listings: BrokerListingDetail[];
  selectedId: string | null;
  onSelect: (id: string) => void;
};

function NativeRentalsListingsGrid({
  listings,
  selectedId,
  onSelect,
}: RentalsListingsGridProps) {
  return (
    <div
      data-testid="rentals-listings-grid"
      className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3"
    >
      {listings.map((listing) => {
        const hero = listing.images[0];
        return (
          <button
            key={listing.id}
            type="button"
            data-testid={`lx-card-${listing.id}`}
            onClick={() => onSelect(listing.id)}
            className="text-left"
          >
            <Card
              className={cn(
                "overflow-hidden transition-shadow hover:shadow-md",
                selectedId === listing.id && "ring-2 ring-primary",
              )}
            >
              <div className="relative aspect-[4/3] bg-muted">
                {hero ? (
                  <Image
                    src={hero}
                    alt=""
                    fill
                    className="object-cover"
                    sizes="(max-width: 768px) 100vw, 33vw"
                    unoptimized
                  />
                ) : (
                  <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
                    No photo yet
                  </div>
                )}
              </div>
              <div className="space-y-2 p-3">
                <div className="flex items-start justify-between gap-2">
                  <h3 className="line-clamp-2 text-sm font-semibold">{listing.title}</h3>
                  <ListingWorkflowPill status={listing.listingWorkflowStatus} compact />
                </div>
                <p className="text-xs text-muted-foreground">{listing.neighborhood}</p>
                <p className="text-sm font-medium">
                  {formatBrokerMonthlyRent(listing.priceMonthly, listing.currency)}
                </p>
                <p className="text-xs text-muted-foreground">
                  {listing.bedrooms ?? "—"} BR · {listing.bathrooms ?? "—"} BA
                </p>
              </div>
            </Card>
          </button>
        );
      })}
    </div>
  );
}

/** Use the canonical restricted EntityCard schema to accept stored images.
 * A rejected URL is never supplied to the official renderer. */
function acceptsImage(image: string): boolean {
  const schema = mdeUI.components.get("EntityCard")?.props;
  return schema instanceof z.ZodObject && schema.safeParse({ title: "Listing", image }).success;
}

function BrokerListingSelection({ listings, rendererKey, onSelect }: RentalsListingsGridProps & { rendererKey: string }) {
  const latest = useRef({ listings, onSelect });
  const mounted = useRef(false);
  useLayoutEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);
  useLayoutEffect(() => { latest.current = { listings, onSelect }; }, [listings, onSelect]);
  useGenerativeUIFunction(mdeUI, "brokerListingSelect", async ({ rendererKey: suppliedKey, listingId }: { rendererKey: string; listingId: string }) => {
    if (!mounted.current || suppliedKey !== rendererKey || !latest.current.listings.some((row) => row.id === listingId)) {
      return { ok: false, error: "This listing is no longer on this page." };
    }
    latest.current.onSelect(listingId);
    return { ok: true };
  });
  return null;
}

/** Reuse the route-owned official surface. Native grid remains the usable
 * fallback during hydration or when a legacy route has no renderer. */
export function RentalsListingsGrid(props: RentalsListingsGridProps) {
  const [rendererKey] = useState(() => crypto.randomUUID());
  const operations = useMemo(
    () => buildBrokerListingGridOperations(props.listings, props.selectedId, rendererKey, acceptsImage),
    [props.listings, props.selectedId, rendererKey],
  );
  return (
    <MdeDashboardSurface surfaceId={BROKER_LISTINGS_SURFACE_ID} operations={operations} fallback={<NativeRentalsListingsGrid {...props} />}>
      <BrokerListingSelection {...props} rendererKey={rendererKey} />
    </MdeDashboardSurface>
  );
}
