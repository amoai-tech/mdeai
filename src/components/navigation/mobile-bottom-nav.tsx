"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Building2,
  House,
  MessageCircle,
  Ticket,
  UtensilsCrossed,
  type LucideIcon,
} from "lucide-react";
import { useKeyboardInset } from "@/lib/hooks/use-chat-keyboard-height";
import { cn } from "@/lib/utils";

/**
 * SAN-1606 — the five-tab mobile navigation.
 *
 * Displayed only for the public consumer routes below, and only below `lg`. The allowlist is
 * resolved from the pathname itself (never from a route prefix), so protected workspaces and
 * transactional flows never get a consumer tab bar even though this mounts once for the whole app.
 *
 * One route-aware mount in RootLayout is deliberate: Home, /chat and the three discovery pages
 * render through different shells, and the rental/restaurant/event detail pages share none of them.
 * Mounting here (plus the strict allowlist) is smaller and safer than five per-surface mounts, and
 * it cannot accidentally inherit an `/app`, `/host` or checkout route.
 */
export type MobileNavTab = "home" | "chat" | "rentals" | "restaurants" | "events";

type MobileNavItem = {
  tab: MobileNavTab;
  href: string;
  /** Visible 12px label. */
  label: string;
  /**
   * Extra words for assistive tech when the visible label is a product nickname. "Eats" is the
   * tab's name on screen; "Restaurants" is the page it opens, so the accessible name says both and
   * still contains the visible label (WCAG 2.5.3 Label in Name).
   */
  spokenSuffix?: string;
  icon: LucideIcon;
};

/** Exactly the five consumer routes the bar serves. Order is the on-screen order. */
export const MOBILE_NAV_ITEMS: readonly MobileNavItem[] = [
  { tab: "home", href: "/", label: "Home", icon: House },
  { tab: "chat", href: "/chat", label: "Chat", icon: MessageCircle },
  { tab: "rentals", href: "/rentals", label: "Rentals", icon: Building2 },
  {
    tab: "restaurants",
    href: "/restaurants",
    label: "Eats",
    spokenSuffix: "Restaurants",
    icon: UtensilsCrossed,
  },
  { tab: "events", href: "/events", label: "Events", icon: Ticket },
] as const;

/** Base route → its tab. */
const BASE_ROUTES: Readonly<Record<string, MobileNavTab>> = {
  "/": "home",
  "/chat": "chat",
  "/rentals": "rentals",
  "/restaurants": "restaurants",
  "/events": "events",
};

/** Parent segment → the tab a single-segment consumer detail inherits. */
const DETAIL_PARENTS: Readonly<Record<string, MobileNavTab>> = {
  rentals: "rentals",
  restaurants: "restaurants",
  events: "events",
};

/**
 * Segment names that must never be treated as a consumer detail even when they are the only extra
 * segment (defence in depth against a future `/events/checkout` style route). Anything with two or
 * more extra segments — `/rentals/123/apply`, `/events/x/checkout` — is already rejected below.
 */
const NON_CONSUMER_SEGMENTS = new Set([
  "admin",
  "app",
  "auth",
  "cancel",
  "cancelled",
  "checkout",
  "host",
  "login",
  "payment",
  "preview",
  "signin",
  "sign-in",
  "signup",
  "sign-up",
  "success",
]);

/**
 * Which tab owns a pathname, or `null` when the bar must not render.
 *
 * Only the five base routes and exactly one segment beneath the three discovery roots qualify.
 * `/chat/<anything>`, `/app/*`, `/host/*`, `/admin/*`, `/login`, `/signup`, checkout and
 * deep/nested routes all return `null`.
 */
export function resolveMobileNavTab(pathname: string | null | undefined): MobileNavTab | null {
  if (!pathname) return null;
  const withoutQuery = pathname.split(/[?#]/, 1)[0] ?? "";
  const normalized =
    withoutQuery.length > 1 ? withoutQuery.replace(/\/+$/, "") : withoutQuery;

  const base = BASE_ROUTES[normalized];
  if (base) return base;

  const segments = normalized.split("/").filter(Boolean);
  if (segments.length !== 2) return null;

  const [parent, child] = segments as [string, string];
  const tab = DETAIL_PARENTS[parent];
  if (!tab) return null;
  if (NON_CONSUMER_SEGMENTS.has(child.toLowerCase())) return null;

  return tab;
}

/**
 * The bar itself. Hides (unmounts) while the on-screen keyboard is open so it can never sit on top
 * of the composer: `useKeyboardInset` already exists for exactly this measurement, and because the
 * bar mounts once for the whole app this is one VisualViewport subscription, not one per page.
 */
export function MobileBottomNav() {
  const pathname = usePathname();
  const activeTab = resolveMobileNavTab(pathname);
  const keyboardInset = useKeyboardInset();

  if (!activeTab || keyboardInset > 0) return null;

  return (
    <nav
      aria-label="Primary"
      className="pointer-events-none fixed inset-x-0 bottom-0 z-40 px-3 pb-[var(--mde-mobile-nav-inset)] lg:hidden"
    >
      {/* The measured bar: 64px tall, 12px side margins, 480px max width, 24px radius. */}
      <ul
        data-testid="mobile-bottom-nav"
        className="pointer-events-auto mx-auto flex h-16 w-full max-w-[480px] items-stretch rounded-3xl border border-border bg-background/95 px-1 shadow-[0_10px_30px_-12px_rgb(0_0_0/0.35)] backdrop-blur supports-[backdrop-filter]:bg-background/90"
      >
        {MOBILE_NAV_ITEMS.map((item) => {
          const active = item.tab === activeTab;
          const Icon = item.icon;
          return (
            <li key={item.tab} className="flex min-w-0 flex-1">
              <Link
                href={item.href}
                data-testid={`mobile-nav-${item.tab}`}
                data-active={active ? "true" : "false"}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex min-h-11 min-w-11 flex-1 flex-col items-center justify-center gap-0.5 rounded-2xl text-xs font-medium leading-none transition-colors motion-reduce:transition-none",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
                  active
                    ? "text-primary"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                <span
                  className={cn(
                    "flex h-7 w-11 items-center justify-center rounded-full",
                    active && "bg-primary/10",
                  )}
                >
                  <Icon className="size-6" aria-hidden="true" />
                </span>
                <span>{item.label}</span>
                {item.spokenSuffix ? (
                  <span className="sr-only"> {item.spokenSuffix}</span>
                ) : null}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
