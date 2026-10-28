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
import { RestaurantVotePanel, type ContestWindow } from "@/components/restaurants/restaurant-vote-panel";
import { contestState } from "@/lib/restaurants/contest-state";
import { VenueCardPlaceholder } from "@/components/browse/venue-card-placeholder";
import { RestaurantReservationRequest } from "@/components/restaurants/restaurant-reservation-request";
import { isRenderableRemoteImage } from "@/lib/images/remote-image-hosts";

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
      <main id="main-content" tabIndex={-1} className="mx-auto max-w-3xl px-4 py-10">
        <h1 className="text-xl font-semibold">We could not load this restaurant</h1>
        <p className="mt-2 text-sm text-muted-foreground">This is a temporary problem, not a missing restaurant. Please try again.</p>
        <Link className="mt-4 inline-block text-sm font-medium underline" href="/restaurants">Back to restaurants</Link>
      </main>
    );
  }

  const { restaurant, listing } = lookup;
  const renderableImages = listing.images
    .map((image) => image.url)
    .filter((url) => isRenderableRemoteImage(url));
  const menuSections: { section: string; items: typeof listing.menu }[] = [];
  for (const item of listing.menu) {
    const section = item.section ?? "Menu";
    const existing = menuSections.find((entry) => entry.section === section);
    if (existing) existing.items.push(item);
    else menuSections.push({ section, items: [item] });
  }
  const meta = [restaurant.neighborhood, restaurant.cuisine].filter(Boolean).join(" · ");
  // priceTier/rating come from the catalog; unknown values stay unstated, never zero.
  const catalogRating =
    typeof restaurant.rating === "number" && restaurant.rating > 0 ? restaurant.rating : null;
  const hasCoords = restaurant.latitude != null && restaurant.longitude != null;
  // SAN-1483 supplies the canonical contest entry; null keeps the honest not-open state.
  // A failing vote lookup must never take down the whole restaurant page.
  let voteTarget: { contestId: string; entityId: string } | null = null;
  // SAN-1524 · when no contest is named and the target is ambiguous, offer the real choices
  // instead of a blank panel. A failing lookup must never take down the whole page.
  let contestOptions: RestaurantContestOption[] = [];
  try {
    voteTarget = await fetchRestaurantVoteTarget(restaurant.id, selectedContestId);
    // One read covers both the ambiguous-contest chooser and the selected contest's real
    // window. A draft/closed contest must never render an actionable Vote that can only fail.
    contestOptions = await fetchRestaurantContestOptions(restaurant.id);
  } catch (err) {
    console.error("[restaurant] vote target lookup threw:", err instanceof Error ? err.message : err);
  }
  const selectedContestOption = voteTarget
    ? contestOptions.find(
        (option) => option.contestId.toLowerCase() === voteTarget!.contestId.toLowerCase(),
      )
    : undefined;
  const contestWindow: ContestWindow | null = selectedContestOption
    ? {
        state: contestState({
          id: selectedContestOption.contestId,
          slug: "",
          title: selectedContestOption.contestTitle,
          description: null,
          status: selectedContestOption.status as "draft" | "live" | "closed" | "archived",
          startsAt: selectedContestOption.startsAt,
          endsAt: selectedContestOption.endsAt,
          coverUrl: null,
        }),
        opensAt: selectedContestOption.startsAt,
        closesAt: selectedContestOption.endsAt,
      }
    : null;
  const mapHref =
    restaurant.mapsUrl ??
    (hasCoords ? "https://www.google.com/maps/search/?api=1&query=" + restaurant.latitude + "," + restaurant.longitude : null);

  return (
    <main id="main-content" tabIndex={-1} className="mx-auto max-w-3xl px-4 py-6">
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
          {catalogRating != null ? " · Rated " + catalogRating.toFixed(1) + " in catalog" : " · Rating not available"}
        </p>
        {restaurant.aiSummary ? <p className="mt-3 text-sm text-foreground">{restaurant.aiSummary}</p> : null}
      </section>

      <RestaurantReservationRequest
        placeId={restaurant.placeId ?? undefined}
        restaurantId={restaurant.id}
        venueTitle={restaurant.name}
      />

      {listing.description ? (
        <section className="mt-6" aria-labelledby="restaurant-about">
          <h2 className="text-lg font-semibold" id="restaurant-about">
            About
          </h2>
          <p className="mt-2 whitespace-pre-line text-sm text-foreground" data-testid="restaurant-public-description">
            {listing.description}
          </p>
        </section>
      ) : null}

      {listing.website || listing.phone ? (
        <section className="mt-6" aria-labelledby="restaurant-contact">
          <h2 className="text-lg font-semibold" id="restaurant-contact">
            Contact
          </h2>
          <div className="mt-2 flex flex-wrap gap-3 text-sm">
            {listing.website ? (
              <a
                className="inline-flex min-h-11 items-center underline"
                data-testid="restaurant-public-website"
                href={listing.website}
                rel="noopener noreferrer"
                target="_blank"
              >
                Restaurant website
              </a>
            ) : null}
            {listing.phone ? (
              <a
                className="inline-flex min-h-11 items-center underline"
                data-testid="restaurant-public-phone"
                href={"tel:" + listing.phone.replace(/[^+0-9]/g, "")}
              >
                {listing.phone}
              </a>
            ) : null}
          </div>
        </section>
      ) : null}

      {listing.hours.length > 0 ? (
        <section className="mt-6" aria-labelledby="restaurant-hours">
          <h2 className="text-lg font-semibold" id="restaurant-hours">
            Opening hours
          </h2>
          <dl className="mt-2 grid max-w-sm grid-cols-2 gap-1 text-sm" data-testid="restaurant-public-hours">
            {listing.hours.map((entry) => (
              <div key={entry.day} className="contents">
                <dt className="capitalize text-muted-foreground">{entry.day}</dt>
                <dd>
                  {entry.open}–{entry.close}
                </dd>
              </div>
            ))}
          </dl>
        </section>
      ) : null}

      {renderableImages.length > 0 ? (
        <section className="mt-6" aria-labelledby="restaurant-photos">
          <h2 className="text-lg font-semibold" id="restaurant-photos">
            Photos
          </h2>
          <ul className="mt-2 grid grid-cols-2 gap-2" data-testid="restaurant-public-gallery">
            {renderableImages.map((url) => (
              <li key={url} className="overflow-hidden rounded-lg border">
                <Image
                  alt={restaurant.name}
                  className="h-40 w-full object-cover"
                  height={320}
                  src={url}
                  width={480}
                />
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {menuSections.length > 0 ? (
        <section className="mt-6" aria-labelledby="restaurant-menu">
          <h2 className="text-lg font-semibold" id="restaurant-menu">
            Menu
          </h2>
          <div className="mt-2 grid gap-4" data-testid="restaurant-public-menu">
            {menuSections.map((group) => (
              <div key={group.section}>
                <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                  {group.section}
                </h3>
                <ul className="mt-1 grid gap-2">
                  {group.items.map((item) => (
                    <li key={item.id} className="text-sm">
                      <div className="flex flex-wrap items-baseline justify-between gap-2">
                        <span className="font-medium">{item.name}</span>
                        <span className="text-muted-foreground">{item.price ?? "Price not published"}</span>
                      </div>
                      {item.description ? (
                        <p className="text-muted-foreground">{item.description}</p>
                      ) : null}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            Menu details are maintained by the restaurant.
          </p>
        </section>
      ) : null}

      <section className="mt-6" aria-labelledby="restaurant-contest">
        <h2 className="text-lg font-semibold" id="restaurant-contest">Restaurant contest</h2>
        {/* SAN-1483 supplies the canonical contest entry for this restaurant. Until it
            lands there is no honest target, so the panel states that instead of inventing one. */}
        <div className="mt-3">
          {!selectedContestId && contestOptions.length > 1 ? (
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
            <RestaurantVotePanel
              contestWindow={contestWindow}
              restaurantName={restaurant.name}
              voteTarget={voteTarget}
            />
          )}
        </div>
      </section>
    </main>
  );
}