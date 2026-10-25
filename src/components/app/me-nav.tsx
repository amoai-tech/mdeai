"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const ITEMS = [
  { href: "/app/me", label: "Overview" },
  { href: "/app/me/saved", label: "Saved" },
  { href: "/app/me/tickets", label: "Tickets" },
] as const;

/**
 * SAN-1576 — Personal sub-navigation. Viewings and Votes stay absent until their
 * domain owners prove a real read path; one honest "not yet" beats broken tiles.
 */
// skipcq: JS-0067
export function MeNav() {
  const pathname = usePathname();

  return (
    <nav
      data-testid="me-nav"
      aria-label="Personal sections"
      className="mb-6 flex flex-wrap gap-2 border-b border-border pb-3"
    >
      {ITEMS.map((item) => {
        const active =
          item.href === "/app/me"
            ? pathname === item.href
            : pathname === item.href || pathname.startsWith(`${item.href}/`);
        return (
          <Link
            key={item.href}
            href={item.href}
            data-testid={`me-nav-${item.label.toLowerCase()}`}
            aria-current={active ? "page" : undefined}
            className={cn(
              "inline-flex min-h-11 items-center rounded-full px-4 text-sm font-medium transition-colors",
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
