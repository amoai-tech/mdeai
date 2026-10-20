"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import Link from "next/link";
import { ArrowRightIcon, PlayIcon } from "lucide-react";
import { useHydrated } from "@/hooks/use-hydrated";
import { HomeMapPreview } from "@/components/home/home-map-teaser";

const chips = [
  "Rentals in Laureles",
  "What's on this weekend?",
  "Best cafés to work from",
  "Rooftop bars in Poblado",
] as const;

interface HomeHeroProps {
  /** Pre-filled query forwarded from /chat?q= → /?q= redirect */
  initialQuery?: string;
}

export function HomeHero({ initialQuery = "" }: HomeHeroProps) {
  const router = useRouter();
  const [query, setQuery] = useState(initialQuery);
  const hydrated = useHydrated();

  const submit = (q: string) => {
    const trimmed = q.trim();
    if (!trimmed) return;
    router.push(`/chat?q=${encodeURIComponent(trimmed)}`);
  };

  return (
    <section
      aria-label="AI concierge search"
      className="relative overflow-hidden bg-primary px-4 pb-0 pt-12 sm:px-6 md:pt-16 lg:px-8"
    >
      {/* Background texture overlay */}
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_80%_50%_at_50%_-20%,oklch(0.85_0.18_175/0.3),transparent)]" aria-hidden="true" />

      <div className="relative mx-auto max-w-7xl">
        <div className="grid items-end gap-4 lg:grid-cols-[1fr_minmax(0,460px)] lg:gap-8">

          {/* Left — text + search */}
          <div className="pb-4 md:pb-6 lg:pb-16">
            {/* Badge */}
            <div className="mb-5">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-primary-foreground/20 bg-primary-foreground/10 px-3 py-1 text-xs font-semibold text-primary-foreground/80">
                <span aria-hidden="true">✦</span>
                AI concierge for Medellín
              </span>
            </div>

            {/* Headline */}
            <h1 className="mb-4 text-5xl font-extrabold leading-[1.05] tracking-tight text-primary-foreground sm:text-6xl md:text-7xl">
              Your city,<br />on demand.
            </h1>
            <p className="mb-8 max-w-lg text-base text-primary-foreground/75 sm:text-lg">
              Ask anything — rentals, events, restaurants, nightlife.
              Real answers grounded in Google Maps, not a list of links.
            </p>

            {/* Search bar */}
            <form
              data-testid="home-concierge-search"
              data-hydrated={hydrated ? "true" : "false"}
              className="flex items-center gap-2 rounded-full border border-primary-foreground/20 bg-background px-4 py-2 shadow-lg transition-shadow duration-200 focus-within:shadow-xl"
              onSubmit={(e) => { e.preventDefault(); submit(query); }}
              role="search"
            >
              <span className="text-base text-accent" aria-hidden="true">✦</span>
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder='Ask anything — "rooftop bars in Provenza tonight"'
                aria-label="Ask the AI concierge"
                autoFocus
                className="min-w-0 flex-1 bg-transparent text-base text-foreground placeholder:text-muted-foreground focus:outline-none"
              />
              <button
                type="submit"
                disabled={!query.trim()}
                aria-label="Search"
                className="flex min-h-[36px] items-center gap-1.5 rounded-full bg-accent px-4 py-1.5 text-sm font-semibold text-accent-foreground transition-colors duration-150 hover:bg-accent/90 disabled:pointer-events-none disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-foreground motion-reduce:transition-none"
              >
                Ask
                <ArrowRightIcon className="size-3.5" aria-hidden="true" />
              </button>
            </form>

            {/* Cold-start chips */}
            <div className="mt-4 flex flex-wrap gap-2">
              {chips.map((chip) => (
                <button
                  key={chip}
                  type="button"
                  onClick={() => submit(chip)}
                  className="rounded-full border border-primary-foreground/20 bg-primary-foreground/10 px-3 py-1.5 text-xs font-medium text-primary-foreground/80 transition-colors duration-150 hover:bg-primary-foreground/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-foreground motion-reduce:transition-none"
                >
                  {chip}
                </button>
              ))}
            </div>

            {/* Secondary CTAs */}
            <div className="mt-8 flex flex-wrap items-center gap-4">
              <Link
                href="/chat"
                className="flex min-h-[44px] items-center gap-2 rounded-full bg-primary-foreground px-6 py-2.5 text-sm font-semibold text-primary transition-all duration-150 hover:bg-primary-foreground/90 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-foreground motion-reduce:transition-none"
              >
                Start exploring
              </Link>
              <Link
                href="#how-it-works"
                className="flex min-h-[44px] items-center gap-2 text-sm font-medium text-primary-foreground/80 transition-colors duration-150 hover:text-primary-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-foreground motion-reduce:transition-none"
              >
                <span className="flex size-8 items-center justify-center rounded-full border border-primary-foreground/30 bg-primary-foreground/10">
                  <PlayIcon className="size-3 fill-current" aria-hidden="true" />
                </span>
                How it works
              </Link>
            </div>
          </div>

          {/* Right — a real map of Medellín: neighbourhood prompts, not listing pins */}
          <div className="pb-12 md:pb-16 lg:self-end">
            <HomeMapPreview />
          </div>

        </div>
      </div>
    </section>
  );
}
