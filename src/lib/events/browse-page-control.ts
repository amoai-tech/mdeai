import { z } from "zod";
import { buildEventBrowseUrl, type EventBrowseFilterState } from "@/lib/events/browse-url";

const CATEGORY = ["music", "food", "culture", "sport", "nightlife"] as const;
const DATE_WINDOW = ["tonight", "this_weekend", "this_week", "next_week", "any"] as const;
const PRICE = ["free", "paid"] as const;

/** Only filters that the native Events page actually renders. */
export const eventPageControlSchema = z.object({
  category: z.enum(CATEGORY).nullable().optional(),
  neighborhood: z.string().trim().min(1).max(80).nullable().optional(),
  dateWindow: z.enum(DATE_WINDOW).nullable().optional(),
  price: z.enum(PRICE).nullable().optional(),
}).strict();

export type EventPageControlPatch = z.infer<typeof eventPageControlSchema>;

export function applyEventPageControl(
  current: EventBrowseFilterState,
  patch: EventPageControlPatch,
): EventBrowseFilterState {
  return {
    category: patch.category === undefined ? current.category : patch.category,
    neighborhood: patch.neighborhood === undefined ? current.neighborhood : patch.neighborhood,
    dateWindow: patch.dateWindow === undefined ? current.dateWindow : patch.dateWindow,
    price: patch.price === undefined ? current.price : patch.price,
  };
}

export function buildEventPageControlUrl(
  current: EventBrowseFilterState,
  patch: EventPageControlPatch,
): string {
  return buildEventBrowseUrl(applyEventPageControl(current, patch));
}
