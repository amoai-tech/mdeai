import { Suspense, type ReactNode } from "react";
import Link from "next/link";
import { ArrowRightIcon } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { EventListRow, PlaceCard } from "@/components/home/home-place-card";
import { HomeEatDrinkTabs } from "@/components/home/home-eat-drink-tabs";
import {
  fetchLiveRentals,
  fetchLiveRestaurants,
  fetchLiveCafes,
  fetchLiveEvents,
  fetchLiveDestinations,
  type PlaceCardData,
} from "@/lib/discovery/fetch-discovery-rows";

// Every card comes from a real record. A section with no real records is not rendered —
// there is no stand-in data (SAN-1556). Each section has its own weight on purpose: rentals are
// the photo-led main event, eat & drink share tabs, events lead with their date.

export interface DiscoveryData {
  destinations: PlaceCardData[];
  rentals: PlaceCardData[];
  restaurants: PlaceCardData[];
  cafes: PlaceCardData[];
  events: PlaceCardData[];
}

const CARD_GRID = "grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4";
const SECTION_LINK =
  "inline-flex min-h-[44px] items-center gap-1.5 text-sm font-semibold text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2";

function Section({
  id,
  title,
  intro,
  link,
  tone = "plain",
  children,
}: {
  id: string;
  title: string;
  intro?: string;
  link?: { href: string; label: string; testId: string };
  tone?: "plain" | "tinted";
  children: ReactNode;
}) {
  return (
    <section
      id={id}
      aria-labelledby={`${id}-heading`}
      className={`${tone === "tinted" ? "bg-muted/40" : "bg-background"} py-12 md:py-16`}
    >
      <div className="mx-auto flex max-w-7xl flex-col gap-6 px-4 sm:px-6 lg:px-8">
        <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-1">
          <div className="max-w-2xl">
            <h2 id={`${id}-heading`} className="text-2xl font-semibold tracking-tight text-foreground md:text-3xl">
              {title}
            </h2>
            {intro && <p className="mt-1.5 text-base text-muted-foreground">{intro}</p>}
          </div>
          {link && (
            <Link href={link.href} data-testid={link.testId} className={SECTION_LINK}>
              {link.label}
              <ArrowRightIcon className="size-4" aria-hidden="true" />
            </Link>
          )}
        </div>
        {children}
      </div>
    </section>
  );
}

function Cards({ cards }: { cards: PlaceCardData[] }) {
  return (
    <div className={CARD_GRID}>
      {cards.map(({ id, ...card }) => (
        <PlaceCard key={id} {...card} />
      ))}
    </div>
  );
}

// ─── Pure render component ────────────────────────────────────────────────────

export function HomeDiscoverySectionsUI({ data }: { data: DiscoveryData }) {
  const { destinations, rentals, restaurants, cafes, events } = data;
  const hasEatDrink = restaurants.length > 0 || cafes.length > 0;

  if (!destinations.length && !rentals.length && !hasEatDrink && !events.length) {
    return (
      <section aria-label="Discover Medellín" className="bg-background py-12 md:py-16">
        <div className="mx-auto flex max-w-7xl flex-col items-start gap-3 px-4 sm:px-6 lg:px-8">
          <h2 className="text-2xl font-semibold text-foreground">Recommendations are unavailable right now</h2>
          <p className="text-base text-muted-foreground">Ask the concierge and it will search for you.</p>
          <Link
            href="/chat"
            data-testid="discovery-empty-cta"
            className="inline-flex min-h-[44px] items-center gap-2 rounded-full bg-primary px-6 text-base font-semibold text-primary-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
          >
            Ask the concierge
          </Link>
        </div>
      </section>
    );
  }

  return (
    <>
      {destinations.length > 0 && (
        <Section
          id="things-to-see"
          title="Things to see in Medellín"
          intro="Places from our city guide. Ask the concierge about any of them."
          link={{
            href: `/chat?q=${encodeURIComponent("What are the best things to see in Medellín?")}`,
            label: "Ask the concierge",
            testId: "discovery-cta-destinations",
          }}
        >
          <Cards cards={destinations} />
        </Section>
      )}

      {rentals.length > 0 && (
        <Section
          id="rentals"
          title="Rentals in Medellín"
          intro="Photos and monthly prices, shown in each listing's own currency."
          link={{ href: "/rentals", label: "Browse all rentals", testId: "discovery-cta-rentals" }}
          tone="tinted"
        >
          <Cards cards={rentals} />
        </Section>
      )}

      {hasEatDrink && (
        <Section
          id="eat-and-drink"
          title="Eat and drink"
          intro="Restaurants and cafés from our listings. Looking for a night out? See nightlife."
          link={{ href: "/nightlife", label: "Nightlife", testId: "discovery-cta-nightlife" }}
        >
          <HomeEatDrinkTabs restaurants={restaurants} cafes={cafes} />
        </Section>
      )}

      {events.length > 0 && (
        <Section
          id="events"
          title="Upcoming events"
          intro="Real events with their real dates."
          link={{ href: "/events", label: "View all events", testId: "discovery-cta-events" }}
          tone="tinted"
        >
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
            {events.map(({ id, ...event }) => (
              <EventListRow key={id} {...event} />
            ))}
          </div>
        </Section>
      )}
    </>
  );
}

// ─── Skeleton (Suspense fallback) ─────────────────────────────────────────────

export function HomeDiscoveryRowsSkeleton() {
  return (
    <section aria-label="Discover Medellín" aria-busy="true" className="bg-background py-12 md:py-16">
      <div className="mx-auto flex max-w-7xl flex-col gap-6 px-4 sm:px-6 lg:px-8">
        <div className="h-8 w-64 animate-pulse rounded bg-muted" />
        <div className={CARD_GRID}>
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="overflow-hidden rounded-xl border bg-card">
              <div className="aspect-[4/3] animate-pulse bg-muted" />
              <div className="flex flex-col gap-2 p-4">
                <div className="h-5 w-3/4 animate-pulse rounded bg-muted" />
                <div className="h-4 w-1/2 animate-pulse rounded bg-muted" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ─── Async inner — fetches live data; failed or empty sections are simply left out ─

const EMPTY: PlaceCardData[] = [];

async function HomeDiscoveryRowsInner() {
  const supabase = await createClient();

  const names = ["rentals", "restaurants", "cafes", "events", "destinations"] as const;
  const results = await Promise.allSettled([
    fetchLiveRentals(supabase),
    fetchLiveRestaurants(supabase),
    fetchLiveCafes(),
    fetchLiveEvents(supabase),
    fetchLiveDestinations(supabase),
  ]);

  const [rentals, restaurants, cafes, events, destinations] = results.map((result, i) => {
    if (result.status === "rejected") {
      console.error("[home-discovery] %s failed", names[i], result.reason);
      return EMPTY;
    }
    return result.value;
  });

  return <HomeDiscoverySectionsUI data={{ rentals, restaurants, cafes, events, destinations }} />;
}

// ─── Public export — self-contained with Suspense skeleton ───────────────────

export function HomeDiscoveryRows() {
  return (
    <Suspense fallback={<HomeDiscoveryRowsSkeleton />}>
      <HomeDiscoveryRowsInner />
    </Suspense>
  );
}
