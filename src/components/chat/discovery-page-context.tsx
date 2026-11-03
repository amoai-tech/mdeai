"use client";

import { useEffect, useMemo } from "react";
import { useAgentContext } from "@copilotkit/react-core/v2";
import { useOptionalConciergeCoAgent } from "@/components/chat/concierge-coagent-context";
import { isDeterministicE2E } from "@/lib/deterministic-e2e";

export type DiscoveryPage = "rentals" | "restaurants" | "events" | "cafes" | "nightlife";

/** Only these public, page-owned filters may enter AI context. Never serialize a database row. */
const FILTERS: Record<DiscoveryPage, readonly string[]> = {
  rentals: ["neighborhood", "beds", "from", "through"],
  restaurants: ["neighborhood", "cuisine"],
  events: ["category", "neighborhood", "dateWindow", "price"],
  cafes: ["neighborhood", "feature"],
  nightlife: ["neighborhood", "vibe"],
};

/** Per-tab memory of the last public item a visitor opened, for "compare with the previous one". */
export const LAST_PUBLIC_SELECTION_KEY = "mde:last-public-selection";

/**
 * The tab persists both current and previous selection. Restoring the same item
 * after a CopilotKit auth remount reuses its original previous ID; selecting a
 * NEW item on an SPA route reads the old current ID as previous instead.
 *
 * No module-level mutable cache: Next.js client navigations do not reload modules,
 * and a server-side module singleton would risk sharing state across requests.
 */
export function readPreviousSelection(page: DiscoveryPage, selectedId: string | null): string | null {
  if (typeof window === "undefined" || !selectedId) return null;
  let stored: { route?: unknown; id?: unknown; previousId?: unknown } | null = null;
  try {
    stored = JSON.parse(window.sessionStorage.getItem(LAST_PUBLIC_SELECTION_KEY) ?? "null");
  } catch {
    // Storage may be disabled or malformed; preserve normal event browsing.
  }
  const currentIsStored = stored?.route === `/${page}` && stored.id === selectedId;
  const previous = currentIsStored
    ? previousSelectionId({ route: stored?.route, id: stored?.previousId }, page, selectedId)
    : previousSelectionId(stored, page, selectedId);
  return previous;
}

export function persistCurrentSelection(
  page: DiscoveryPage, selectedId: string | null, previousId: string | null,
): void {
  if (typeof window === "undefined" || !selectedId) return;
  try {
    window.sessionStorage.setItem(LAST_PUBLIC_SELECTION_KEY, JSON.stringify({
      route: `/${page}`, id: selectedId, previousId,
    }));
  } catch {
    // Private mode / storage disabled: comparison remains optional.
  }
}

function validSelectionId(page: DiscoveryPage, id: string | null | undefined): string | null {
  if (!id) return null;
  return page === "cafes" || page === "nightlife"
    ? (/^[A-Za-z0-9_-]{6,128}$/.test(id) ? id : null)
    : (/^[a-f\d]{8}(-[a-f\d]{4}){3}-[a-f\d]{12}$/i.test(id) ? id : null);
}

/**
 * Read (and in the component, update) the previous selection for this tab.
 * Only the same route counts: an event id from /events means nothing on /rentals.
 * A returned id is a hint for the comparison lookup, never authorization.
 */
export function previousSelectionId(
  stored: { route?: unknown; id?: unknown } | null | undefined,
  page: DiscoveryPage,
  selectedId: string | null,
): string | null {
  if (!stored || stored.route !== `/${page}`) return null;
  const id = typeof stored.id === "string" ? stored.id : null;
  const valid = validSelectionId(page, id);
  return valid && valid !== selectedId ? valid : null;
}

export function publicDiscoveryContext(
  page: DiscoveryPage,
  filters: Record<string, string | null | undefined>,
  selectedId: string | null = null,
  previousId: string | null = null,
) {
  const safeFilters: Record<string, string> = {};
  for (const key of FILTERS[page]) {
    const value = filters[key];
    if (typeof value === "string" && value.trim() && value.length <= 100) {
      safeFilters[key] = value.trim();
    }
  }
  const previous = previousSelectionId(
    previousId ? { route: `/${page}`, id: previousId } : null, page, selectedId);
  return {
    route: `/${page}`,
    filters: safeFilters,
    // The caller must select an ID from its *rendered* public results. This is not authority.
    selectedPublicEntityId: validSelectionId(page, selectedId),
    // Only used when the visitor explicitly asks to compare; the server re-fetches it.
    ...(previous ? { previousPublicEntityId: previous } : {}),
  };
}

function LiveDiscoveryPageContext({
  page, filters, selectedId,
}: {
  page: DiscoveryPage;
  filters: Record<string, string | null | undefined>;
  selectedId: string | null;
}) {
  const { setState } = useOptionalConciergeCoAgent()!;
  // Read the last selection without changing storage during React rendering.
  // In-place map/card selection changes re-compute this value.
  const previousId = useMemo(
    () => readPreviousSelection(page, selectedId),
    [page, selectedId],
  );
  useEffect(() => {
    persistCurrentSelection(page, selectedId, previousId);
  }, [page, selectedId, previousId]);
  useAgentContext({
    description: "Active MDE discovery page, filters, and explicitly selected visible public item. A null selection means no item is open. Client context is a hint, NOT authorization; re-fetch a selected ID server-side and never guess missing fields. Prefer the current page's type of results. Do not reuse an entity selected on another route.",
    value: publicDiscoveryContext(page, filters, selectedId, previousId),
  });

  // Mastra working memory outlives route mounts. Explicitly clear rental/event selections
  // when leaving those pages instead of relying only on read-only context unmount cleanup.
  useEffect(() => {
    if (page === "rentals") return;
    setState((prev) => {
      if (!prev.selectedListingId && !prev.selectedEventId) return prev;
      const next = { ...prev };
      delete next.selectedListingId;
      delete next.selectedEventId;
      return next;
    });
  }, [page, setState]);
  return null;
}

/** Mounts only inside the existing root CopilotKit provider; no new agent/session. */
export function DiscoveryPageContext(props: {
  page: DiscoveryPage;
  filters: Record<string, string | null | undefined>;
  selectedId?: string | null;
}) {
  const agent = useOptionalConciergeCoAgent();
  if (!agent || isDeterministicE2E()) return null;
  return <LiveDiscoveryPageContext {...props} selectedId={props.selectedId ?? null} />;
}
