import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { UtensilsCrossed } from "lucide-react";
import { fetchRestaurantById } from "@/lib/restaurants/fetch-restaurant-by-id";
import { RestaurantVotePanel } from "@/components/restaurants/restaurant-vote-panel";
import { VenueCardPlaceholder } from "@/components/browse/venue-card-placeholder";

export const dynamic = "force-dynamic";

export default async function RestaurantDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const restaurant = await fetchRestaurantById(id);
  if (!restaurant) notFound();

  const meta = [restaurant.neighborhood, restaurant.cuisine].filter(Boolean).join(" · ");
  // priceTier/rating are derived estimates from the catalog; never present them as confirmed facts.
  const hasRating = typeof restaurant.rating === "number" && restaurant.rating > 0;

  return (
    <main className="mx-auto max-w-3xl px-4 py-6">
      <Link className="text-sm text-neutral-600 underline" href="/restaurants">Restaurants</Link>
      <div className="mt-4 overflow-hidden rounded-xl border">
        {restaurant.imageUrl ? (
          <Image alt={restaurant.name} className="h-56 w-full object-cover" height={448} src={restaurant.imageUrl} width={768} />
        ) : (
          <VenueCardPlaceholder icon={<UtensilsCrossed aria-hidden />} label="Restaurant" testId="restaurant-detail-photo-placeholder" />
        )}
        <div className="p-4">
          <h1 className="text-2xl font-semibold">{restaurant.name}</h1>
          <p className="mt-1 text-sm text-neutral-600">{meta}</p>
          <p className="mt-1 text-xs text-neutral-500" data-testid="detail-estimates">
            {restaurant.priceTier ? "Price " + restaurant.priceTier + " (estimated)" : ""}
            {hasRating ? " · Rated " + restaurant.rating.toFixed(1) + " in catalog" : " · Rating not available"}
          </p>
          {restaurant.aiSummary ? <p className="mt-3 text-sm text-neutral-700">{restaurant.aiSummary}</p> : null}
          <div className="mt-5">
            <RestaurantVotePanel restaurantName={restaurant.name} voteTarget={null} />
          </div>
        </div>
      </div>
    </main>
  );
}