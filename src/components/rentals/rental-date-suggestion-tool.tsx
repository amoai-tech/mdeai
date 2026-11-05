"use client";

import { useFrontendTool } from "@copilotkit/react-core/v2";
import { z } from "zod";
import { isOrderedStay, isRealCalendarDate } from "@/lib/rentals/date-only";
import type { SuggestedStay } from "@/components/rentals/rental-date-selector";

/**
 * SAN-1611 — the Concierge may PROPOSE a stay; only the renter can apply it.
 *
 * Registered once, by the browse view (the filter bar mounts twice, for desktop and phone, so it
 * must not own a tool). The handler validates with the same date-only rules the UI uses and hands
 * the result to the calendar's DRAFT. It never navigates, never searches, never writes a booking.
 */
export function RentalDateSuggestionTool({ onSuggest }: { onSuggest: (stay: SuggestedStay) => void }) {
  useFrontendTool(
    {
      name: "suggestRentalDates",
      // A suggestion is the answer; no follow-up model run is needed.
      followUp: false,
      description:
        "Propose a stay (first day and optional last day) for the renter to review in the date calendar. Use only dates the renter stated or that are consistent with their request. This opens the calendar with a DRAFT: it does not apply, search, or book anything. Use it ONLY when choosing the stay dates is what the renter asked for. If they want apartments (bedrooms, price, neighbourhood, \"find me\", \"show me rentals\", \"cheaper options\"), that is a listing search: call search-rentals with those dates as filters instead, and do not open this calendar.",
      parameters: z.object({
        from: z.string().describe("First day of the stay, YYYY-MM-DD."),
        through: z.string().nullish().describe("Last day of the stay, YYYY-MM-DD, inclusive. Omit for a single move-in date."),
      }),
      handler: async ({ from, through }) => {
        if (!isRealCalendarDate(from)) {
          return `"${from}" is not a real calendar date. Ask the renter for the exact day, for example 2026-11-12.`;
        }
        if (through && !isRealCalendarDate(through)) {
          return `"${through}" is not a real calendar date. Ask the renter for the exact day.`;
        }
        if (through && !isOrderedStay(from, through)) {
          return "The last day cannot be before the first day. Ask the renter which day they leave.";
        }
        onSuggest({ from, through: through ?? null });
        return through
          ? `Opened the calendar with ${from} to ${through} as a draft. The renter still has to apply it.`
          : `Opened the calendar with ${from} as a draft. The renter still has to apply it.`;
      },
    },
    [],
  );
  return null;
}
