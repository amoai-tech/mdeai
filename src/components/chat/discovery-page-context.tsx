"use client";

import { useEffect, useState } from "react";
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
 * Captured once per page load. The provider can remount while the CopilotKit
 * session resolves (guest -> user), and a remount after the write would read its
 * own page as "previous" and lose the item the visitor came from.
 */
let previousSelectionForThisPage: string | null | undefined;

/** Test-only reset for the per-page-load capture. */
export function resetPreviousSelectionCaptureForTest() {
  previousSelectionForThisPage = undefined;
}

export function capturePreviousSelection(page: DiscoveryPage, selectedId: string | null): string | null {
  if (previousSelectionForThisPage !== undefined) return previousSelectionForThisPage;
  let stored: { route?: unknown; id?: unknown } | null = null;
  if (typeof window !== "undefined") {
    try {
      stored = JSON.parse(window.sessionStorage.getItem(LAST_PUBLIC_SELECTION_KEY) ?? "null");
    } catch {
      stored = null;
    }
  }
  previousSelectionForThisPage = previousSelectionId(stored, page, selectedId);
  if (typeof window !== "undefined" && selectedId) {
    try {
      window.sessionStorage.setItem(LAST_PUBLIC_SELECTION_KEY, JSON.stringify({ route: `/${page}`, id: selectedId }));
    } catch {
      // Private mode / storage disabled: comparison falls back to asking which item.
    }
  }
  return previousSelectionForThisPage;
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
  // The visitor's previous item in this tab, so "compare with the previous one" can
  // work after a page change. Read once on mount: this page is the current item now.
  const [previousId] = useState<string | null>(() => capturePreviousSelection(page, selectedId));
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
