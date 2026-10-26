"use client";

import { useEffect, useRef } from "react";
import { useFrontendTool } from "@copilotkit/react-core/v2";
import { z } from "zod";
import type { Rental } from "@/mastra/tools/search-rentals";
import { resolveRentalForDetails } from "@/lib/rentals/details-target";

const openRentalDetailsParams = z.object({
  listingId: z
    .string()
    .optional()
    .describe("Listing id from the current rental results, e.g. 5247d1e6-…. Pin ids (rental-<id>) also work."),
  index: z
    .number()
    .int()
    .min(1)
    .optional()
    .describe("1-based position in the current results; 1 means the first apartment."),
});

/**
 * SAN-1421 post-merge — let the agent open the same in-page Details panel the card opens.
 *
 * The tool can only resolve an apartment that is already on the page. It never fetches or invents
 * one, so "show me the details" cannot navigate away, open a different listing, or lose the thread.
 */
export function RentalDetailsFrontendTool({
  results,
  onOpen,
}: {
  results: Rental[];
  onOpen: (rental: Rental) => void;
}) {
  // The agent calls the handler long after registration; keep the latest page state in refs.
  const resultsRef = useRef(results);
  const onOpenRef = useRef(onOpen);
  useEffect(() => {
    resultsRef.current = results;
  }, [results]);
  useEffect(() => {
    onOpenRef.current = onOpen;
  }, [onOpen]);

  useFrontendTool(
    {
      name: "openRentalDetails",
      // A pure UI action: opening the panel is the answer. Without this, CopilotKit starts a
      // follow-up run after the tool result, the model calls the tool again, and the loop hits the
      // 100-run depth limit while the composer stays busy.
      followUp: false,
      description:
        "Open the in-page Details panel for an apartment already in the current rental results. Use when the renter asks to see or open the details of an apartment, the first/selected one, or a result by id. Do not use for a new search.",
      parameters: openRentalDetailsParams,
      handler: async ({ listingId, index }) => {
        const current = resultsRef.current;
        if (current.length === 0) {
          return "No apartments are shown yet. Ask MDE to search for apartments first.";
        }
        const rental = resolveRentalForDetails(current, { listingId, index });
        if (!rental) {
          if (listingId) return `No apartment with id ${listingId} is in the current results.`;
          if (index !== undefined) return `No apartment ${index} is in the current results.`;
          return "No apartment is available to open.";
        }
        onOpenRef.current(rental);
        return `Opened details for ${rental.title}.`;
      },
    },
    [],
  );
  return null;
}
