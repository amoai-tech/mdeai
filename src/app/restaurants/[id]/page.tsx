import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { UtensilsCrossed } from "lucide-react";
import {
  fetchRestaurantById,
  fetchRestaurantContestOptions,
  fetchRestaurantVoteTarget,
  type RestaurantContestOption,
} from "@/lib/restaurants/fetch-restaurant-by-id";
import { RestaurantVotePanel } from "@/components/restaurants/restaurant-vote-panel";
import { VenueCardPlaceholder } from "@/components/browse/venue-card-placeholder";

export const dynamic = "force-dynamic";

export default async function RestaurantDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ contest_id?: string | string[] }>;
}) {
  const { id } = await params;
  const query = await searchParams;
  // A contest-aware link identifies the actual ballot. Never guess when the same
  // restaurant participates in multiple development contests.
  const selectedContestId = typeof query.contest_id === "string" ? query.contest_id : null;
  const lookup = await fetchRestaurantById(id);
  if (lookup.status === "not_found") notFound();
  if (lookup.status === "error") {
    return (
      <main className="mx-auto max-w-3xl px-4 py-10">
        <h1 className="text-xl font-semibold">We could not load this restaurant</h1>
        <p className="mt-2 text-sm text-muted-foreground">This is a temporary problem, not a missing restaurant. Please try again.</p>
        <Link className="mt-4 inline-block text-sm font-medium underline" href="/restaurants">Back to restaurants</Link>
      </main>
    );
  }

  const { restaurant } = lookup;
  const meta = [restaurant.neighborhood, restaurant.cuisine].filter(Boolean).join(" · ");
  // priceTier/rating are derived estimates from the catalog; never present them as confirmed facts.
  const hasRating = typeof restaurant.rating === "number" && restaurant.rating > 0;
  const hasCoords = restaurant.latitude != null && restaurant.longitude != null;
  // SAN-1483 supplies the canonical contest entry; null keeps the honest not-open state.
  // A failing vote lookup must never take down the whole restaurant page.
  let voteTarget: { contestId: string; entityId: string } | null = null;
  // SAN-1524 · when no contest is named and the target is ambiguous, offer the real choices
  // instead of a blank panel. A failing lookup must never take down the whole page.
  let contestOptions: RestaurantContestOption[] = [];
  try {
    voteTarget = await fetchRestaurantVoteTarget(restaurant.id, selectedContestId);
    if (!voteTarget && !selectedContestId) {
      contestOptions = await fetchRestaurantContestOptions(restaurant.id);
    }
  } catch (err) {
    console.error("[restaurant] vote target lookup threw:", err instanceof Error ? err.message : err);
  }
  const mapHref =
    restaurant.mapsUrl ??
    (hasCoords ? "https://www.google.com/maps/search/?api=1&query=" + restaurant.latitude + "," + restaurant.longitude : null);

  return (
    <main className="mx-auto max-w-3xl px-4 py-6">
      <Link className="text-sm text-muted-foreground underline" href="/restaurants">Restaurants</Link>
      <div className="mt-4 overflow-hidden rounded-xl border">
        {restaurant.imageUrl ? (
          <Image alt={restaurant.name} className="h-56 w-full object-cover" height={448} src={restaurant.imageUrl} width={768} />
        ) : (
          <VenueCardPlaceholder icon={<UtensilsCrossed aria-hidden />} label="Restaurant" testId="restaurant-detail-photo-placeholder" />
        )}
        <div className="p-4">
          <h1 className="text-2xl font-semibold">{restaurant.name}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{meta}</p>
          {mapHref ? (
            <a className="mt-2 inline-flex min-h-11 items-center text-sm font-medium underline" href={mapHref} rel="noopener noreferrer" target="_blank" data-testid="restaurant-view-map">
              View map
            </a>
          ) : null}
        </div>
      </div>

      <section className="mt-6" aria-labelledby="restaurant-details">
        <h2 className="text-lg font-semibold" id="restaurant-details">Restaurant details</h2>
        <p className="mt-1 text-xs text-muted-foreground" data-testid="detail-estimates">
          {restaurant.priceTier ? "Price " + restaurant.priceTier + " (estimated)" : "Price not available"}
          {hasRating ? " · Rated " + restaurant.rating.toFixed(1) + " in catalog" : " · Rating not available"}
        </p>
        {restaurant.aiSummary ? <p className="mt-3 text-sm text-foreground">{restaurant.aiSummary}</p> : null}
      </section>

      <section className="mt-6" aria-labelledby="restaurant-contest">
        <h2 className="text-lg font-semibold" id="restaurant-contest">Restaurant contest</h2>
        {/* SAN-1483 supplies the canonical contest entry for this restaurant. Until it
            lands there is no honest target, so the panel states that instead of inventing one. */}
        <div className="mt-3">
          {contestOptions.length > 1 ? (
            <div data-testid="vote-contest-chooser">
              <p className="text-sm text-foreground">
                {restaurant.name} is competing in more than one contest. Choose where to vote.
              </p>
              <ul className="mt-3 space-y-2">
                {contestOptions.map((option) => (
                  <li key={option.contestId}>
                    <Link
                      className="inline-flex min-h-11 items-center rounded-md border px-4 text-sm font-medium"
                      data-testid="vote-contest-option"
                      href={"/restaurants/" + restaurant.id + "?contest_id=" + option.contestId}
                    >
                      Vote in {option.contestTitle}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <RestaurantVotePanel restaurantName={restaurant.name} voteTarget={voteTarget} />
          )}
        </div>
      </section>
    </main>
  );
}