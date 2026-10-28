"use client";

import { useRef, useState } from "react";
import { useConciergeChat } from "@/lib/hooks/use-concierge-chat";
import { useConciergeCoAgent } from "@/components/chat/concierge-coagent-context";
import type { ConciergeWorkingMemory } from "@/lib/types";
import { eventSubChipPrompt } from "@/lib/event-query-classifier";
import { useEventSearchFastPath } from "@/hooks/use-event-search-fast-path";
import { clearConciergeError } from "@/lib/concierge-error-store";
import { sendConciergeUserMessage } from "@/lib/concierge-send-user-message";
import { useConciergeSendHandlers } from "@/lib/hooks/use-concierge-send-handlers";
import { cn } from "@/lib/utils";
import {
  CHAT_FILTER_CHIPS,
  EVENT_SUB_CHIPS,
  applyChipToggle,
  isChipActive,
  type FilterChipDef,
} from "@/platform/copilot/chat-filter-chips";

/** SCREEN-003 + F39 — sticky chips → concierge working memory; event sub-row when Events active. */
export function ChatQueryBar() {
  const { state: agentState, setState } = useConciergeCoAgent();
  const { appendMessage, isLoading } = useConciergeChat();
  const { handleEventChip } = useEventSearchFastPath();
  // Reuse the same classify → rental fast-path → Mastra fallback sender as the chat composer.
  const sendHandlers = useConciergeSendHandlers();
  const priceRequestRef = useRef(false);
  const [priceSearching, setPriceSearching] = useState(false);
  const [localState, setLocalState] = useState<ConciergeWorkingMemory>({});

  const memory: ConciergeWorkingMemory = { ...localState, ...(agentState ?? {}) };
  const eventsChip = CHAT_FILTER_CHIPS.find((c) => c.id === "events");
  const eventsMode =
    eventsChip != null && isChipActive(memory, eventsChip);

  function toggleChip(chip: FilterChipDef) {
    const nextActive = !isChipActive(memory, chip);
    const next = applyChipToggle(memory, chip, nextActive);
    setLocalState(next);
    setState(next);
  }

  async function onPriceChip(chip: FilterChipDef) {
    if (priceRequestRef.current || isLoading || chip.maxPriceMonthly == null || !chip.budgetCurrency) return;
    const nextActive = !isChipActive(memory, chip);
    const next = applyChipToggle(memory, chip, nextActive);
    setLocalState(next);
    setState(next);
    // Removing a chip only changes the next search scope; it must not claim an
    // unfiltered search ran or fabricate any rental cards.
    if (!nextActive) return;

    priceRequestRef.current = true;
    setPriceSearching(true);
    try {
      const budget = chip.maxPriceMonthly.toLocaleString("en-US");
      // The explicit sentence lets the existing rental query parser carry an exact monthly
      // amount and original currency into /api/rentals/search, even before React rerenders.
      await sendConciergeUserMessage(
        `Find rental apartments under ${chip.budgetCurrency} ${budget}/month`,
        sendHandlers,
      );
    } catch (error) {
      console.error("[chat-query-bar] monthly rental search failed", error);
    } finally {
      priceRequestRef.current = false;
      setPriceSearching(false);
    }
  }

  async function onEventSubChip(chip: FilterChipDef) {
    const nextActive = !isChipActive(memory, chip);
    const next = applyChipToggle(memory, chip, nextActive);
    setLocalState(next);
    setState(next);
    if (!nextActive || isLoading) return;
    clearConciergeError();

    const prompt = eventSubChipPrompt({
      label: chip.label,
      category: chip.eventCategory,
      dateWindow: chip.eventDateWindow,
      showAll: chip.eventShowAll,
    });
    const handled = await handleEventChip(chip, prompt, next);
    if (!handled) {
      await appendMessage(prompt);
    }
  }

  return (
    <div
      data-testid="chat-query-bar"
      className="sticky top-0 z-10 shrink-0 border-b border-border bg-background/95 px-4 py-2 backdrop-blur supports-[backdrop-filter]:bg-background/80"
    >
      <p className="mb-2 text-xs font-medium text-muted-foreground">
        Medellín · filters scope your next message; the budget chip searches now
      </p>
      <div
        className="flex flex-wrap gap-1.5"
        role="group"
        aria-label="Search filters"
      >
        {CHAT_FILTER_CHIPS.map((chip) => {
          const active = isChipActive(memory, chip);
          return (
            <button
              key={chip.id}
              type="button"
              data-testid={`filter-chip-${chip.id}`}
              data-active={active ? "true" : "false"}
              aria-pressed={active}
              disabled={chip.group === "price" && (priceSearching || isLoading)}
              onClick={() => chip.group === "price" ? void onPriceChip(chip) : toggleChip(chip)}
              className={cn(
                "rounded-full border px-2.5 py-1 text-xs font-medium transition-colors",
                active
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-border bg-muted/50 text-foreground hover:bg-muted",
              )}
            >
              {chip.label}
            </button>
          );
        })}
      </div>
      {eventsMode ? (
        <div
          className="mt-2 flex flex-wrap gap-1.5 border-t border-border/60 pt-2"
          role="group"
          aria-label="Event categories"
          data-testid="event-sub-chips"
        >
          {EVENT_SUB_CHIPS.map((chip) => {
            const active = isChipActive(memory, chip);
            return (
              <button
                key={chip.id}
                type="button"
                data-testid={`filter-chip-${chip.id}`}
                data-active={active ? "true" : "false"}
                aria-pressed={active}
                disabled={isLoading}
                onClick={() => onEventSubChip(chip)}
                className={cn(
                  "rounded-full border px-2.5 py-1 text-xs font-medium transition-colors",
                  active
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border bg-muted/40 text-foreground hover:bg-muted",
                )}
              >
                {chip.label}
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
