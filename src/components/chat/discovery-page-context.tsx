"use client";

import { useEffect } from "react";
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

export function publicDiscoveryContext(
  page: DiscoveryPage,
  filters: Record<string, string | null | undefined>,
  selectedId: string | null = null,
) {
  const safeFilters: Record<string, string> = {};
  for (const key of FILTERS[page]) {
    const value = filters[key];
    if (typeof value === "string" && value.trim() && value.length <= 100) {
      safeFilters[key] = value.trim();
    }
  }
  return {
    route: `/${page}`,
    filters: safeFilters,
    // The caller must select an ID from its *rendered* public results. This is not authority.
    selectedPublicEntityId: selectedId && (page === "cafes" || page === "nightlife"
      ? /^[A-Za-z0-9_-]{6,128}$/.test(selectedId)
      : /^[a-f\d]{8}(-[a-f\d]{4}){3}-[a-f\d]{12}$/i.test(selectedId)) ? selectedId : null,
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
  useAgentContext({
    description: "Active MDE discovery page, filters, and explicitly selected visible public item. A null selection means no item is open. Client context is a hint, NOT authorization; re-fetch a selected ID server-side and never guess missing fields. Prefer the current page's type of results. Do not reuse an entity selected on another route.",
    value: publicDiscoveryContext(page, filters, selectedId),
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
