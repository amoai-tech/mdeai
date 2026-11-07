"use client";

import { useRef, useState, type Dispatch } from "react";
import { ArrowUp } from "lucide-react";
import type { GroundedToolRow } from "@/lib/parse-grounded-tool-result";
import { countWithNoun } from "@/lib/format/count-with-noun";

/**
 * Guest search for cafés and nightlife over the public venue-anchor route.
 *
 * This is **catalogue search**: it returns real venue rows that the existing cards, map pins and
 * Details panel render, and it never reaches the agent runtime. The copy says "Search results",
 * because claiming an AI answer here would be a lie a visitor could catch.
 *
 * Same discipline as the restaurant composer: one search in flight, honest 429/503 messages, and a
 * genuine empty answer reported as empty rather than as an error.
 */
export type VenueGuestOptions = {
  kind: "cafe" | "nightlife";
  neighborhood?: string | null;
  onResults: Dispatch<GroundedToolRow[]>;
};

export function GuestVenueSearchScoped({ options }: { options: VenueGuestOptions }) {
  // A new filter scope means a new result set, so the old summary must not survive it. The key sits
  // on the guest subtree only: a filter change never remounts the signed-in concierge.
  return (
    <GuestVenueSearch
      key={`${options.kind}:${options.neighborhood ?? ""}`}
      options={options}
    />
  );
}

export function GuestVenueSearch({ options }: { options: VenueGuestOptions }) {
  const [question, setQuestion] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const abort = useRef<AbortController | null>(null);
  const noun = options.kind === "cafe" ? ["café", "cafés"] : ["nightlife venue", "nightlife venues"];

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
      const response = await fetch("/api/venues/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          kind: options.kind,
          queryText: query,
          limit: 12,
          ...(options.neighborhood ? { neighborhood: options.neighborhood } : {}),
        }),
      });
      if (!response.ok) {
        throw new Error(
          response.status === 429
            ? "Too many searches. Try again shortly."
            : "Venue search is unavailable. Please retry.",
        );
      }
      const json: unknown = await response.json();
      if (!json || typeof json !== "object" || !Array.isArray((json as { results?: unknown }).results)) {
        throw new Error("Invalid venue search response. Please retry.");
      }
      const body = json as { results: GroundedToolRow[]; total?: number };
      options.onResults(body.results);
      setMessage(
        body.results.length === 0
          ? `No ${noun[1]} matched “${query}”. Try a neighborhood or a different word.`
          : `Search results — ${countWithNoun(body.results.length, noun[0], noun[1])} for “${query}”.`,
      );
      setQuestion("");
    } catch (err) {
      if (!controller.signal.aborted) {
        setError(err instanceof Error ? err.message : "Venue search failed.");
      }
    } finally {
      if (!controller.signal.aborted) setBusy(false);
    }
  };

  return (
    <div data-testid="guest-venue-ask" className="space-y-2">
      <p className="text-sm text-muted-foreground">
        Search {options.kind === "cafe" ? "cafés" : "nightlife"} without signing in. Sign in for
        saved AI conversations.
      </p>
      <div className="flex items-end gap-2">
        <label htmlFor={`guest-venue-question-${options.kind}`} className="sr-only">
          Search {options.kind === "cafe" ? "cafés" : "nightlife venues"}
        </label>
        <textarea
          id={`guest-venue-question-${options.kind}`}
          rows={1}
          value={question}
          onChange={(event) => { setQuestion(event.target.value); }}
          className="min-h-11 flex-1 resize-none rounded-lg border bg-background px-3 py-2.5 text-base"
          placeholder={
            options.kind === "cafe" ? "Quiet café in Laureles" : "Salsa clubs in El Poblado"
          }
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
              event.preventDefault();
              void send();
            }
          }}
        />
        <button
          type="button"
          data-testid="guest-venue-send"
          className="flex size-11 items-center justify-center rounded-lg bg-primary text-primary-foreground disabled:opacity-40"
          disabled={!question.trim() || busy}
          onClick={() => { void send(); }}
          aria-label="Send venue search"
        >
          <ArrowUp className="size-4" />
        </button>
      </div>
      {message ? (
        <p role="status" data-testid="guest-venue-summary" className="text-xs text-muted-foreground">
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
