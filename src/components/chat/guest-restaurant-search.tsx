"use client";

import { useRef, useState } from "react";
import { ArrowUp } from "lucide-react";
import type { Restaurant } from "@/mastra/tools/search-restaurants";

/**
 * Guest restaurant search, reusing the existing public, rate-limited catalog endpoint.
 *
 * This is **catalog search**, not the concierge: it returns grounded restaurant rows and the
 * existing cards and map render them. It never claims to answer a question, never invents a
 * result, and never reaches the agent runtime — a signed-in visitor keeps the full conversation.
 *
 * The same abort discipline as the events composer applies: a newer search cancels the older
 * one, so a slow response can never replace fresher results.
 */
export type RestaurantGuestOptions = {
  neighborhood?: string | null;
  cuisine?: string | null;
  /** Receives grounded rows; an empty list means a genuine no-match answer. */
  onResults: (rows: Restaurant[], meta: { total: number; query: string }) => void;
};

/**
 * Filter-scoped wrapper: a new neighborhood or cuisine means a new result set, so the previous
 * summary must not survive it. The key sits here — on the guest subtree only — so a filter change
 * never remounts the signed-in concierge and never discards an unsent draft.
 */
export function GuestRestaurantSearch({ options }: { options: RestaurantGuestOptions }) {
  return (
    <GuestRestaurantComposer
      key={`${options.neighborhood ?? ""}:${options.cuisine ?? ""}`}
      options={options}
    />
  );
}

export function GuestRestaurantComposer({ options }: { options: RestaurantGuestOptions }) {
  const [question, setQuestion] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const abort = useRef<AbortController | null>(null);

  const send = async () => {
    const query = question.trim();
    if (!query || busy) return;
    abort.current?.abort();
    const controller = new AbortController();
    abort.current = controller;
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const response = await fetch("/api/restaurants/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          queryText: query,
          limit: 12,
          ...(options.neighborhood ? { neighborhood: options.neighborhood } : {}),
          ...(options.cuisine ? { cuisine: options.cuisine } : {}),
        }),
      });
      if (!response.ok) {
        throw new Error(
          response.status === 429
            ? "Too many searches. Try again shortly."
            : "Restaurant search is unavailable. Please retry.",
        );
      }
      const json: unknown = await response.json();
      if (!json || typeof json !== "object" || !Array.isArray((json as { results?: unknown }).results)) {
        throw new Error("Invalid restaurant search response. Please retry.");
      }
      const body = json as { results: Restaurant[]; total?: number };
      options.onResults(body.results, { total: body.total ?? body.results.length, query });
      setMessage(
        body.results.length === 0
          ? `No restaurants matched “${query}”. Try a neighborhood or a cuisine.`
          : `Showing ${body.results.length} result${body.results.length === 1 ? "" : "s"} for “${query}”.`,
      );
      setQuestion("");
    } catch (err) {
      if (!controller.signal.aborted) {
        setError(err instanceof Error ? err.message : "Restaurant search failed.");
      }
    } finally {
      if (!controller.signal.aborted) setBusy(false);
    }
  };

  return (
    <div data-testid="guest-restaurant-ask" className="space-y-2">
      <p className="text-sm text-muted-foreground">
        Search restaurants without signing in. Sign in for saved AI conversations.
      </p>
      <div className="flex items-end gap-2">
        <label htmlFor="guest-restaurant-question" className="sr-only">
          Search restaurants
        </label>
        <textarea
          id="guest-restaurant-question"
          rows={1}
          value={question}
          onChange={(event) => setQuestion(event.target.value)}
          className="min-h-11 flex-1 resize-none rounded-lg border bg-background px-3 py-2.5 text-base"
          placeholder="Quiet restaurants in Laureles"
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
              event.preventDefault();
              void send();
            }
          }}
        />
        <button
          type="button"
          data-testid="guest-restaurant-send"
          className="flex size-11 items-center justify-center rounded-lg bg-primary text-primary-foreground disabled:opacity-40"
          disabled={!question.trim() || busy}
          onClick={() => void send()}
          aria-label="Send restaurant search"
        >
          <ArrowUp className="size-4" />
        </button>
      </div>
      {message ? (
        <p role="status" data-testid="guest-restaurant-summary" className="text-xs text-muted-foreground">
          {message}
        </p>
      ) : null}
      {error ? (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}
