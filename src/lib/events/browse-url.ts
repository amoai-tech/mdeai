import type { DateWindow, EventCategory } from "@/mastra/tools/search-events";

export type EventBrowseFilterState = {
  category?: EventCategory | null;
  neighborhood?: string | null;
  dateWindow?: DateWindow | null;
  price?: "free" | "paid" | null;
};

/** One URL builder for the native event filter chips and the AI page-control action. */
export function buildEventBrowseUrl(filters: EventBrowseFilterState): string {
  const params = new URLSearchParams();
  if (filters.category) params.set("category", filters.category);
  if (filters.neighborhood) params.set("neighborhood", filters.neighborhood);
  if (filters.dateWindow && filters.dateWindow !== "any") {
    params.set("dateWindow", filters.dateWindow);
  }
  if (filters.price) params.set("price", filters.price);
  const query = params.toString();
  return query ? `/events?${query}` : "/events";
}
