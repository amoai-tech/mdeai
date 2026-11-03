"use client";

import Link from "next/link";
import { ArrowRightIcon } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PlaceCard } from "@/components/home/home-place-card";
import type { PlaceCardData } from "@/lib/discovery/fetch-discovery-rows";

const GRID = "grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4";
const CTA =
  "inline-flex min-h-[44px] items-center gap-1.5 text-sm font-semibold text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2";

/** Restaurants and cafés share one section instead of two near-identical card walls. */
export function HomeEatDrinkTabs({
  restaurants,
  cafes,
}: {
  restaurants: PlaceCardData[];
  cafes: PlaceCardData[];
}) {
  const panels = [
    { id: "restaurants", label: "Restaurants", cards: restaurants, href: "/restaurants", cta: "See all restaurants" },
    { id: "cafes", label: "Cafés", cards: cafes, href: "/cafes", cta: "Explore cafés" },
  ].filter((panel) => panel.cards.length > 0);

  if (panels.length === 0) return null;

  return (
    <Tabs defaultValue={panels[0].id} className="gap-6">
      {panels.length > 1 && (
        <TabsList className="h-12 w-full max-w-sm">
          {panels.map((panel) => (
            <TabsTrigger key={panel.id} value={panel.id} className="min-h-[44px] px-4 text-base">
              {panel.label}
            </TabsTrigger>
          ))}
        </TabsList>
      )}
      {panels.map((panel) => (
        <TabsContent key={panel.id} value={panel.id} className="flex flex-col gap-4">
          <div className={GRID}>
            {panel.cards.map(({ id, ...card }) => (
              <PlaceCard key={id} {...card} />
            ))}
          </div>
          <Link href={panel.href} data-testid={`discovery-cta-${panel.id}`} className={`${CTA} self-start`}>
            {panel.cta}
            <ArrowRightIcon className="size-4" aria-hidden="true" />
          </Link>
        </TabsContent>
      ))}
    </Tabs>
  );
}
