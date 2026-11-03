import Link from "next/link";
import { HomeIcon, UtensilsIcon, Music2Icon, CalendarDaysIcon, CoffeeIcon } from "lucide-react";

const verticals = [
  { label: "Rentals", href: "/rentals", Icon: HomeIcon, testId: "vertical-rentals" },
  { label: "Restaurants", href: "/restaurants", Icon: UtensilsIcon, testId: "vertical-restaurants" },
  { label: "Cafés", href: "/cafes", Icon: CoffeeIcon, testId: "vertical-cafes" },
  { label: "Nightlife", href: "/nightlife", Icon: Music2Icon, testId: "vertical-nightlife" },
  { label: "Events", href: "/events", Icon: CalendarDaysIcon, testId: "vertical-events" },
] as const;

/** One compact row of links, not a second wall of cards. */
export function HomeVerticalsStrip() {
  return (
    <nav aria-label="Browse by category" className="border-b border-border bg-background">
      <ul className="mx-auto flex max-w-7xl gap-2 overflow-x-auto px-4 py-3 sm:px-6 lg:justify-center lg:px-8">
        {verticals.map(({ label, href, Icon, testId }) => (
          <li key={label} className="shrink-0">
            <Link
              href={href}
              data-testid={testId}
              className="inline-flex min-h-[44px] items-center gap-2 rounded-full border border-border bg-card px-4 text-base font-medium text-foreground transition-colors duration-150 hover:border-primary/40 hover:bg-primary/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 motion-reduce:transition-none"
            >
              <Icon className="size-4 text-primary" aria-hidden="true" />
              {label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
