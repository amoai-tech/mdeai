"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { cn } from "@/lib/utils";

type HostRentalsNavProps = {
  /**
   * Route family the nav points at. Legacy `/host/rentals` is the default so
   * both trees keep working while `/app/rentals` is introduced.
   */
  basePath?: string;
};

// skipcq: JS-0067 - ES module export; not browser global scope
export function HostRentalsNav({ basePath = "/host/rentals" }: HostRentalsNavProps) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  // SAN-1685 — the /app tree treats Overview as the default page and Concierge
  // as an explicit chat mode. The legacy /host tree keeps its original
  // Concierge-landing behaviour until it is migrated.
  const appTree = basePath === "/app/rentals";
  const mode = searchParams.get("mode");
  const overviewHref = `${basePath}?mode=overview`;
  const conciergeHref = appTree ? `${basePath}?mode=concierge` : basePath;
  const isOverview = appTree
    ? pathname === basePath && mode !== "concierge"
    : pathname === basePath && mode === "overview";
  const isConcierge = appTree
    ? pathname === basePath && mode === "concierge"
    : pathname === basePath && !isOverview;

  const navItems = [
    {
      href: conciergeHref,
      label: "Concierge",
      testId: "host-rentals-nav-concierge",
      match: "concierge" as const,
    },
    {
      href: `${basePath}/listings`,
      label: "Listings",
      testId: "host-rentals-nav-listings",
      match: "listings" as const,
    },
    {
      href: overviewHref,
      label: "Overview",
      testId: "host-rentals-nav-overview",
      match: "overview" as const,
    },
  ];

  function isActive(match: (typeof navItems)[number]["match"]): boolean {
    if (match === "overview") return isOverview;
    if (match === "concierge") return isConcierge;
    return pathname.startsWith(`${basePath}/listings`);
  }

  return (
    <nav
      data-testid="host-rentals-nav"
      className="flex flex-wrap items-center gap-2 border-b border-border pb-3"
      aria-label="Rentals host navigation"
    >
      {navItems.map((item) => {
        const active = isActive(item.match);
        return (
          <Link
            key={item.href}
            href={item.href}
            data-testid={item.testId}
            aria-current={active ? "page" : undefined}
            className={cn(
              "rounded-full px-3 py-1.5 text-sm font-medium transition-colors",
              active
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-muted hover:text-foreground",
            )}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
