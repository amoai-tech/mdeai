"use client";

import { useEffect, useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import type { PlaceSearchResult } from "@/lib/place-search";

type Props = {
  value: string;
  onTextChange: (value: string) => void;
  onSelect: (result: PlaceSearchResult) => void;
  onClearSelection: () => void;
};

const MIN_QUERY_LENGTH = 5;

/**
 * Server-proxied Google Places (New) address picker for broker onboarding.
 * The broker selects a provider-backed address; free text still works and leaves
 * coordinates unknown. The Places key never reaches the browser.
 */
export function BrokerAddressSearch({ value, onTextChange, onSelect, onClearSelection }: Props) {
  const [results, setResults] = useState<PlaceSearchResult[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const committedRef = useRef<string | null>(null);

  useEffect(() => {
    const query = value.trim();
    // Short queries are cleared by the input handler; do nothing here rather than
    // calling setState synchronously inside the effect.
    if (query.length < MIN_QUERY_LENGTH) return;
    // A just-selected address must not trigger another search.
    if (committedRef.current === value) return;

    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setLoading(true);
      setFailed(false);
      try {
        const res = await fetch(`/api/places/search?q=${encodeURIComponent(query)}`, {
          signal: controller.signal,
        });
        if (!res.ok) throw new Error(`status ${res.status}`);
        const body = (await res.json()) as { results?: PlaceSearchResult[] };
        setResults(Array.isArray(body.results) ? body.results : []);
        setOpen(true);
      } catch (err) {
        if ((err as { name?: string }).name === "AbortError") return;
        setResults([]);
        setFailed(true);
        setOpen(false);
      } finally {
        setLoading(false);
      }
    }, 350);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [value]);

  return (
    <div className="relative" data-testid="ro-address-search">
      <Input
        id="ro-address"
        value={value}
        autoComplete="off"
        placeholder="72 10th Street, Laureles"
        aria-autocomplete="list"
        onChange={(e) => {
          committedRef.current = null;
          setResults([]);
          setOpen(false);
          setFailed(false);
          onClearSelection();
          onTextChange(e.target.value);
        }}
      />
      {loading ? (
        <p className="mt-1 text-xs text-muted-foreground">Searching addresses…</p>
      ) : null}
      {failed ? (
        <p className="mt-1 text-xs text-muted-foreground">
          Address search is unavailable — you can still type the address and save a draft.
        </p>
      ) : null}
      {open && results.length > 0 ? (
        <ul
          role="listbox"
          className="absolute z-10 mt-1 w-full overflow-hidden rounded-md border border-border bg-popover shadow-md"
        >
          {results.map((result) => (
            <li key={result.placeId}>
              <button
                type="button"
                data-testid="ro-address-option"
                className="block w-full px-3 py-2 text-left text-sm hover:bg-muted"
                onClick={() => {
                  const label = result.formattedAddress ?? result.displayName ?? value;
                  committedRef.current = label;
                  onSelect(result);
                  onTextChange(label);
                  setOpen(false);
                  setResults([]);
                }}
              >
                <span className="block truncate">{result.displayName ?? result.formattedAddress}</span>
                {result.formattedAddress ? (
                  <span className="block truncate text-xs text-muted-foreground">
                    {result.formattedAddress}
                  </span>
                ) : null}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      {open && !loading && results.length === 0 && value.trim().length >= MIN_QUERY_LENGTH ? (
        <p className="mt-1 text-xs text-muted-foreground">No matching address found.</p>
      ) : null}
    </div>
  );
}
