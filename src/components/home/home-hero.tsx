"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import Link from "next/link";
import { ArrowRightIcon } from "lucide-react";
import { useHydrated } from "@/hooks/use-hydrated";
import { HomeMapPreview } from "@/components/home/home-map-teaser";

// Three starters, each a real thing the concierge answers. Rentals first: it is the main journey.
const chips = ["Rentals in Laureles", "What's on this weekend?", "Cafés to work from"] as const;

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
      className="relative overflow-hidden bg-linear-to-b from-primary to-primary/90 px-4 pt-12 sm:px-6 md:pt-16 lg:px-8"
    >
      <div
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_80%_50%_at_50%_-20%,oklch(0.85_0.18_175/0.3),transparent)]"
        aria-hidden="true"
      />

      <div className="relative mx-auto max-w-7xl">
        <div className="grid grid-cols-1 items-end gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,460px)] lg:gap-10">
          {/* Left — headline + the one search */}
          <div className="min-w-0 lg:pb-16">
            <h1 className="text-4xl font-extrabold leading-[1.08] tracking-tight text-primary-foreground sm:text-5xl md:text-6xl">
              Ask about Medellín.
              <br />
              See it on the map.
            </h1>
            <p className="mt-4 max-w-lg text-lg leading-relaxed text-primary-foreground/80">
              Rentals, restaurants, cafés and events. Real places, shown on a real map.
            </p>

            <form
              data-testid="home-concierge-search"
              data-hydrated={hydrated ? "true" : "false"}
              className="mt-8 flex items-center gap-2 rounded-full border border-primary-foreground/20 bg-background py-2 pl-5 pr-2 shadow-lg transition-shadow duration-200 focus-within:shadow-xl motion-reduce:transition-none"
              onSubmit={(e) => {
                e.preventDefault();
                submit(query);
              }}
              role="search"
            >
              <span className="text-lg text-accent" aria-hidden="true">
                ✦
              </span>
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Try “furnished 2BR in Laureles under COP 4M”"
                aria-label="Ask the AI concierge"
                className="min-h-[44px] min-w-0 flex-1 bg-transparent text-base text-foreground placeholder:text-muted-foreground focus:outline-none"
              />
              <button
                type="submit"
                disabled={!query.trim()}
                aria-label="Search"
                className="flex min-h-[48px] items-center gap-2 rounded-full bg-accent px-6 text-base font-semibold text-accent-foreground transition-colors duration-150 hover:bg-accent/90 disabled:pointer-events-none disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-foreground focus-visible:ring-offset-2 motion-reduce:transition-none"
              >
                Ask
                <ArrowRightIcon className="size-4" aria-hidden="true" />
              </button>
            </form>

            <div className="mt-4 flex flex-wrap gap-2">
              {chips.map((chip) => (
                <button
                  key={chip}
                  type="button"
                  onClick={() => submit(chip)}
                  className="min-h-[44px] rounded-full border border-primary-foreground/25 bg-primary-foreground/10 px-4 text-base font-medium text-primary-foreground transition-colors duration-150 hover:bg-primary-foreground/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-foreground focus-visible:ring-offset-2 focus-visible:ring-offset-primary motion-reduce:transition-none"
                >
                  {chip}
                </button>
              ))}
            </div>

            <Link
              href="#how-it-works"
              className="mt-4 inline-flex min-h-[44px] items-center text-base font-medium text-primary-foreground/80 underline-offset-4 hover:text-primary-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-foreground"
            >
              How it works
            </Link>
          </div>

          {/* Right — a real map of Medellín: neighbourhood prompts, not listing pins */}
          <div className="min-w-0 pb-10 md:pb-12 lg:self-end">
            <HomeMapPreview />
          </div>
        </div>
      </div>
    </section>
  );
}
