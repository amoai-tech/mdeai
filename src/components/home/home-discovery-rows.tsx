import { Suspense } from "react";
import Image from "next/image";
import Link from "next/link";
import { ArrowRightIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { createClient } from "@/lib/supabase/server";
import { isRenderableRemoteImage } from "@/lib/images/remote-image-hosts";
import {
  fetchLiveRentals,
  fetchLiveRestaurants,
  fetchLiveCafes,
  fetchLiveEvents,
  fetchLiveDestinations,
  type PlaceCardData,
} from "@/lib/discovery/fetch-discovery-rows";

// ─── Rows ─────────────────────────────────────────────────────────────────────
// Every card comes from a real record. A row with no real records is not rendered —
// there is no stand-in data (SAN-1556).

export interface RowData {
  id: string;
  label: string;
  href: string;
  ctaLabel: string;
  cards: PlaceCardData[];
}

type RowHeader = Omit<RowData, "cards">;

const ROW_HEADERS: RowHeader[] = [
  { id: "rentals", label: "Rentals in Medellín", href: "/rentals", ctaLabel: "Browse all rentals" },
  { id: "restaurants", label: "Top-rated restaurants", href: "/restaurants", ctaLabel: "See all restaurants" },
  { id: "cafes", label: "Cafés", href: "/cafes", ctaLabel: "Explore cafés" },
  { id: "events", label: "Upcoming events", href: "/events", ctaLabel: "View all events" },
  {
    id: "destinations",
    label: "Things to see in Medellín",
    href: `/chat?q=${encodeURIComponent("What are the best things to see in Medellín?")}`,
    ctaLabel: "Ask the concierge",
  },
];

// ─── PlaceCard ────────────────────────────────────────────────────────────────

function PlaceCard({
  name,
  kind,
  rating,
  meta,
  why,
  image,
  query,
  href,
}: Omit<PlaceCardData, "id">) {
  // A photo is rendered only for a host next/image is configured for; otherwise the
  // card is an honest text card rather than a broken or crashing image.
  const hasPhoto = isRenderableRemoteImage(image);
  return (
    <Link
      href={href ?? `/chat?q=${encodeURIComponent(query)}`}
      className="group block rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
    >
      <Card className="h-full overflow-hidden transition-all duration-200 group-hover:border-primary/30 group-hover:shadow-md motion-reduce:transition-none">
        {hasPhoto ? (
          <div className="relative h-36 overflow-hidden bg-muted">
            <Image
              src={image}
              alt={name}
              fill
              className="object-cover transition-transform duration-300 group-hover:scale-105 motion-reduce:transition-none"
              sizes="(max-width: 640px) 50vw, 25vw"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/30 to-transparent" />
            <Badge
              variant="secondary"
              className="absolute left-2 top-2 bg-background/85 text-xs font-semibold backdrop-blur-sm"
            >
              {kind}
            </Badge>
          </div>
        ) : (
          <div className="px-3 pt-3">
            <Badge variant="secondary" className="text-xs font-semibold">
              {kind}
            </Badge>
          </div>
        )}

        <CardContent className="flex flex-col gap-1.5 p-3">
          <p className="line-clamp-1 text-sm font-semibold text-foreground">{name}</p>
          {(rating != null || meta) && (
            <div className="flex items-center gap-2">
              {rating != null && (
                <span className="text-xs font-bold text-accent">★ {rating}</span>
              )}
              {meta && <span className="text-xs text-muted-foreground">{meta}</span>}
            </div>
          )}
          {why && (
            <p className="line-clamp-2 text-xs leading-relaxed text-muted-foreground">{why}</p>
          )}
        </CardContent>
      </Card>
    </Link>
  );
}

// ─── PlaceCard Skeleton ───────────────────────────────────────────────────────

function PlaceCardSkeleton() {
  return (
    <div className="rounded-xl border bg-card overflow-hidden">
      <div className="h-36 bg-muted animate-pulse" />
      <div className="p-3 flex flex-col gap-2">
        <div className="h-4 w-3/4 bg-muted rounded animate-pulse" />
        <div className="h-3 w-1/2 bg-muted rounded animate-pulse" />
        <div className="space-y-1">
          <div className="h-3 w-full bg-muted rounded animate-pulse" />
          <div className="h-3 w-4/5 bg-muted rounded animate-pulse" />
        </div>
      </div>
    </div>
  );
}

// ─── Pure render component ────────────────────────────────────────────────────

export function HomeDiscoveryRowsUI({ rows }: { rows: RowData[] }) {
  const visible = rows.filter((row) => row.cards.length > 0);

  if (visible.length === 0) {
    return (
      <section aria-label="Discover Medellín" className="bg-background py-10 md:py-14">
        <div className="mx-auto flex max-w-7xl flex-col items-start gap-3 px-4 sm:px-6 lg:px-8">
          <h2 className="text-base font-semibold text-foreground md:text-lg">
            Recommendations are unavailable right now
          </h2>
          <p className="text-sm text-muted-foreground">
            Ask the concierge and it will search for you.
          </p>
          <Link
            href="/chat"
            data-testid="discovery-empty-cta"
            className="inline-flex min-h-[44px] items-center gap-2 rounded-full bg-primary px-6 text-sm font-semibold text-primary-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
          >
            Ask the concierge
          </Link>
        </div>
      </section>
    );
  }

  return (
    <section aria-label="Discover Medellín" className="bg-background py-10 md:py-14">
      <div className="mx-auto flex max-w-7xl flex-col gap-10 px-4 sm:px-6 lg:px-8">
        {visible.map(({ id, label, href, ctaLabel, cards }) => (
          <div key={id} className="flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-semibold text-foreground md:text-lg">{label}</h2>
              <Link
                href={href}
                data-testid={`discovery-cta-${id}`}
                className="flex items-center gap-1 text-xs font-medium text-primary transition-colors duration-200 hover:text-primary/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-1 motion-reduce:transition-none"
              >
                {ctaLabel}
                <ArrowRightIcon className="size-3.5" aria-hidden="true" />
              </Link>
            </div>

            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {cards.map((card) => (
                <PlaceCard key={card.id} {...card} />
              ))}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

// ─── Skeleton (Suspense fallback) ─────────────────────────────────────────────

export function HomeDiscoveryRowsSkeleton() {
  return (
    <section
      aria-label="Discover Medellín"
      aria-busy="true"
      className="bg-background py-10 md:py-14"
    >
      <div className="mx-auto flex max-w-7xl flex-col gap-10 px-4 sm:px-6 lg:px-8">
        {Array.from({ length: 4 }).map((_, rowIdx) => (
          <div key={rowIdx} className="flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <div className="h-5 w-36 bg-muted rounded animate-pulse" />
              <div className="h-4 w-24 bg-muted rounded animate-pulse" />
            </div>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {Array.from({ length: 4 }).map((_, cardIdx) => (
                <PlaceCardSkeleton key={cardIdx} />
              ))}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

// ─── Async inner — fetches live data; failed or empty rows are simply left out ─

async function HomeDiscoveryRowsInner() {
  const supabase = await createClient();

  const results = await Promise.allSettled([
    fetchLiveRentals(supabase),
    fetchLiveRestaurants(supabase),
    fetchLiveCafes(),
    fetchLiveEvents(supabase),
    fetchLiveDestinations(supabase),
  ]);

  const rows: RowData[] = ROW_HEADERS.map((header, i) => {
    const result = results[i];
    if (result.status === "rejected") {
      console.error("[home-discovery-rows] %s failed", header.id, result.reason);
      return { ...header, cards: [] };
    }
    return { ...header, cards: result.value };
  });

  return <HomeDiscoveryRowsUI rows={rows} />;
}

// ─── Public export — self-contained with Suspense skeleton ───────────────────

export function HomeDiscoveryRows() {
  return (
    <Suspense fallback={<HomeDiscoveryRowsSkeleton />}>
      <HomeDiscoveryRowsInner />
    </Suspense>
  );
}
