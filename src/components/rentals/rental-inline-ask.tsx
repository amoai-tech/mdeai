"use client";

import { useState, type FormEvent } from "react";
import { Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { budgetNotApplied, buildRentalSearchParams, canFastPathRentalSearch } from "@/lib/rental-query-parser";
import type { Rental } from "@/mastra/tools/search-rentals";

export type RentalInlineAskPayload = {
  results: Rental[];
  total: number;
  query: string;
  /** The question named a budget the search could not apply; say so instead of implying it did. */
  budgetNotice?: string;
};

type Props = {
  /** Replace the visible cards and map pins with the answer to the question. */
  onResults: (payload: RentalInlineAskPayload) => void;
  /** Drop the answer and show the page's unfiltered results again. */
  onClear: () => void;
  /** The question whose answer is currently displayed, when there is one. */
  activeQuery: string | null;
};

const EXAMPLES = [
  "Furnished 2-bedroom in Laureles under COP 3 million",
  "Pet-friendly studio in Envigado",
  "Apartments in El Poblado with a pool",
];

const UNAVAILABLE = "Rental search is temporarily unavailable. Please try again.";
const FAILED = "Could not search rentals right now. Please try again.";

/**
 * SAN-1421 — ask MDE directly on /rentals instead of sending the renter to /chat.
 *
 * The page still owns the canonical search: this form only turns one question into the same
 * structured request the chat fast path already posts to /api/rentals/search, and hands the
 * real Supabase rows back to the browse view. No second search engine, no second agent.
 */
export function RentalInlineAsk({ onResults, onClear, activeQuery }: Props) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const search = async (raw: string) => {
    const query = raw.trim();
    if (!query || busy) return;
    setBusy(true);
    setError(null);
    try {
      const memory = {};
      // Reuse the exact classifier the chat fast path uses; a question that is not a rental
      // request still goes through the hybrid search instead of being silently dropped.
      const params = canFastPathRentalSearch(query, memory)
        ? buildRentalSearchParams(query, memory)
        : null;
      const response = await fetch("/api/rentals/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // The shared endpoint caps a page at 20; asking for more would be a 400, not more rows.
        body: JSON.stringify({ ...(params ?? { queryText: query }), limit: 20 }),
      });
      if (response.status === 503) {
        setError(UNAVAILABLE);
        return;
      }
      if (!response.ok) {
        setError(FAILED);
        return;
      }
      const data = (await response.json()) as {
        results?: Rental[];
        total?: number;
        budgetNote?: string;
      };
      if (!Array.isArray(data.results)) {
        setError(FAILED);
        return;
      }
      const paramsApplied = params ?? {};
      onResults({
        results: data.results,
        total: data.total ?? data.results.length,
        query,
        budgetNotice: budgetNotApplied(query, paramsApplied)
          ? "I could not apply a monthly budget from that question yet, so check the price on each card."
          : undefined,
      });
      setText(query);
    } catch {
      setError(FAILED);
    } finally {
      setBusy(false);
    }
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    void search(text);
  };

  return (
    <form
      data-testid="rental-inline-ask"
      onSubmit={submit}
      className="mb-4 rounded-xl border border-border bg-card p-3 sm:p-4"
    >
      <div className="flex items-center gap-2">
        <Sparkles className="size-4 text-primary" aria-hidden />
        <label htmlFor="rental-inline-ask-input" className="text-sm font-medium">
          Ask MDE
        </label>
      </div>
      <div className="mt-2 flex gap-2">
        <Input
          id="rental-inline-ask-input"
          data-testid="rental-inline-ask-input"
          value={text}
          onChange={(event) => setText(event.target.value)}
          placeholder="Find furnished 2-bedroom apartments in Laureles under COP 3 million"
          disabled={busy}
          maxLength={300}
          autoComplete="off"
        />
        <Button
          type="submit"
          data-testid="rental-inline-ask-submit"
          disabled={busy || text.trim().length === 0}
        >
          {busy ? "Searching…" : "Ask"}
        </Button>
      </div>
      <div className="mt-2 flex flex-wrap gap-2">
        {EXAMPLES.map((example) => (
          <Button
            key={example}
            type="button"
            variant="outline"
            size="xs"
            data-testid="rental-inline-ask-example"
            disabled={busy}
            onClick={() => {
              setText(example);
              void search(example);
            }}
          >
            {example}
          </Button>
        ))}
      </div>
      {activeQuery ? (
        <p data-testid="rental-inline-ask-summary" className="mt-2 text-sm text-muted-foreground">
          Showing matches for “{activeQuery}”.{" "}
          <button
            type="button"
            data-testid="rental-inline-ask-clear"
            className="font-medium text-primary underline-offset-2 hover:underline"
            onClick={onClear}
          >
            Clear
          </button>
        </p>
      ) : null}
      {error ? (
        <p role="alert" data-testid="rental-inline-ask-error" className="mt-2 text-sm text-destructive">
          {error}{" "}
          <button
            type="button"
            className="font-medium underline underline-offset-2"
            onClick={() => void search(text || activeQuery || "")}
          >
            Try again
          </button>
        </p>
      ) : null}
    </form>
  );
}
