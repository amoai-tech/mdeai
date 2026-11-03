"use client";

import Link from "next/link";
import { X } from "lucide-react";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import type { Restaurant } from "@/mastra/tools/search-restaurants";

function RestaurantDetails({
  restaurant,
  onClose,
}: {
  restaurant: Restaurant;
  onClose: () => void;
}) {
  return (
    <div className="space-y-4 bg-background p-5" data-testid="restaurant-details">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="font-serif text-xl font-semibold">{restaurant.name}</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {restaurant.cuisine} · {restaurant.neighborhood}
          </p>
        </div>
        <button type="button" aria-label="Close restaurant details" data-testid="restaurant-details-close"
          className="inline-flex size-11 shrink-0 items-center justify-center rounded-lg border"
          onClick={onClose}><X className="size-4" /></button>
      </div>
      {restaurant.aiSummary ? <p className="text-sm">{restaurant.aiSummary}</p> : null}
      <div className="flex gap-3 text-sm">
        {restaurant.priceTier ? <span>Price range: {restaurant.priceTier}</span> : <span>Price not specified</span>}
        {restaurant.rating != null ? <span>Rating: {restaurant.rating}</span> : null}
      </div>
      <div className="flex flex-wrap gap-3">
        <Link href={`/restaurants/${restaurant.id}`}
          className="inline-flex min-h-11 items-center rounded-lg border px-4 text-sm font-medium">Full details</Link>
        {restaurant.mapsUrl ? <a href={restaurant.mapsUrl} target="_blank" rel="noopener noreferrer"
          className="inline-flex min-h-11 items-center rounded-lg border px-4 text-sm font-medium">Google Maps</a> : null}
      </div>
    </div>
  );
}

export function RestaurantDetailsPanel(props: { restaurant: Restaurant; onClose: () => void }) {
  return (
    <section data-testid="restaurant-details-panel" className="absolute inset-0 z-20 overflow-y-auto rounded-xl border bg-background shadow-xl">
      <RestaurantDetails {...props} />
    </section>
  );
}
export function RestaurantDetailsSheet(props: { restaurant: Restaurant; onClose: () => void }) {
  return (
    <Sheet open onOpenChange={(open) => { if (!open) props.onClose(); }}>
      <SheetContent side="bottom" className="max-h-[85dvh] overflow-y-auto p-0" showCloseButton={false}>
        <SheetTitle className="sr-only">{props.restaurant.name}</SheetTitle>
        <RestaurantDetails {...props} />
      </SheetContent>
    </Sheet>
  );
}
