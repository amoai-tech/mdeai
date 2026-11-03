import Link from "next/link";
import { ArrowRightIcon } from "lucide-react";

/**
 * Neighbourhood guide. Names and one-line character copy are curated editorial text, and each
 * tile opens the concierge with a question about that area. There are no photos on purpose:
 * we have no licensed neighbourhood photography yet, and a stock picture of "a Medellín street"
 * on a card named for one neighbourhood would look like that neighbourhood. Add real photos here
 * when they exist.
 */
const neighborhoods = [
  {
    id: "laureles",
    name: "Laureles",
    vibe: "Tree-lined streets, plenty of cafés, easy to walk.",
    query: "Explore Laureles — cafés, restaurants, and things to do",
  },
  {
    id: "poblado",
    name: "El Poblado",
    vibe: "Rooftop bars, fine dining and Parque Lleras at the centre.",
    query: "Explore El Poblado — rooftops, restaurants, and events",
  },
  {
    id: "envigado",
    name: "Envigado",
    vibe: "Quieter and more local, with neighbourhood restaurants.",
    query: "Explore Envigado — local food, parks, and hidden spots",
  },
  {
    id: "centro",
    name: "El Centro",
    vibe: "The historic core: Plaza Botero, Mercado del Río, street life.",
    query: "Explore El Centro — history, food markets, and culture",
  },
] as const;

export function HomeNeighborhoods() {
  return (
    <div>
      <h3 className="text-xl font-semibold tracking-tight text-foreground">Know your neighbourhood</h3>
      <p className="mt-1 text-base text-muted-foreground">Pick an area and ask the concierge about it.</p>
      <ul className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2">
        {neighborhoods.map(({ id, name, vibe, query }) => (
          <li key={id}>
            <Link
              href={`/chat?q=${encodeURIComponent(query)}`}
              data-testid={`neighborhood-${id}`}
              className="group flex h-full items-start justify-between gap-3 rounded-xl border border-border bg-linear-to-br from-primary/10 via-card to-accent/10 p-4 transition-shadow duration-200 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 motion-reduce:transition-none"
            >
              <span>
                <span className="block text-lg font-semibold text-foreground">{name}</span>
                <span className="mt-1 block text-sm leading-relaxed text-muted-foreground">{vibe}</span>
              </span>
              <ArrowRightIcon className="mt-1 size-5 shrink-0 text-primary transition-transform group-hover:translate-x-0.5 motion-reduce:transition-none" aria-hidden="true" />
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
