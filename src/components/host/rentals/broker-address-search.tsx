"use client";

import { useCallback, useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { Input } from "@/components/ui/input";
import type { PlaceSearchResult } from "@/lib/place-search";

type Props = {
  value: string;
  onTextChange: (value: string) => void;
  onSelect: (result: PlaceSearchResult) => void;
  onClearSelection: () => void;
};

const MIN_QUERY_LENGTH = 5;
const LISTBOX_ID = "ro-address-listbox";
const optionId = (index: number) => `ro-address-option-${index}`;

/**
 * Server-proxied Google Places (New) address picker for broker onboarding.
 *
 * Follows the WAI-ARIA listbox pattern: the input is a combobox, ArrowUp/ArrowDown
 * move the active option, Enter selects it, Escape closes the list, and the active
 * option is exposed through aria-activedescendant. Free text still works and leaves
 * the location unknown; Google verification happens server-side on save.
 */
export function BrokerAddressSearch({ value, onTextChange, onSelect, onClearSelection }: Props) {
  const [results, setResults] = useState<PlaceSearchResult[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
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
        setActiveIndex(-1);
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

  const selectResult = useCallback(
    (result: PlaceSearchResult) => {
      const label = result.formattedAddress ?? result.displayName ?? value;
      committedRef.current = label;
      onSelect(result);
      onTextChange(label);
      setOpen(false);
      setResults([]);
      setActiveIndex(-1);
    },
    [onSelect, onTextChange, value],
  );

  function handleKeyDown(event: ReactKeyboardEvent<HTMLInputElement>) {
    if (event.key === "Escape") {
      setOpen(false);
      setActiveIndex(-1);
      return;
    }
    if ((event.key === "ArrowDown" || event.key === "ArrowUp") && results.length > 0) {
      event.preventDefault();
      if (!open) setOpen(true);
      setActiveIndex((prev) => {
        const start = open ? prev : -1;
        if (event.key === "ArrowDown") return (start + 1) % results.length;
        return start <= 0 ? results.length - 1 : start - 1;
      });
      return;
    }
    if (event.key === "Enter" && open && activeIndex >= 0 && activeIndex < results.length) {
      event.preventDefault();
      selectResult(results[activeIndex]);
    }
  }

  const showNoResults =
    open && !loading && results.length === 0 && value.trim().length >= MIN_QUERY_LENGTH;

  return (
    <div className="relative" data-testid="ro-address-search">
      <Input
        id="ro-address"
        value={value}
        autoComplete="off"
        placeholder="72 10th Street, Laureles"
        role="combobox"
        aria-expanded={open && results.length > 0}
        aria-controls={LISTBOX_ID}
        aria-autocomplete="list"
        aria-activedescendant={activeIndex >= 0 ? optionId(activeIndex) : undefined}
        onKeyDown={handleKeyDown}
        onChange={(e) => {
          committedRef.current = null;
          setResults([]);
          setOpen(false);
          setActiveIndex(-1);
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
          id={LISTBOX_ID}
          role="listbox"
          className="absolute z-10 mt-1 w-full overflow-hidden rounded-md border border-border bg-popover shadow-md"
        >
          {results.map((result, index) => (
            <li
              key={result.placeId}
              id={optionId(index)}
              role="option"
              aria-selected={index === activeIndex}
              data-testid="ro-address-option"
              className={`block w-full cursor-pointer px-3 py-2 text-left text-sm ${
                index === activeIndex ? "bg-muted" : "hover:bg-muted"
              }`}
              onMouseEnter={() => setActiveIndex(index)}
              onMouseDown={(event) => {
                event.preventDefault();
                selectResult(result);
              }}
            >
              <span className="block truncate">{result.displayName ?? result.formattedAddress}</span>
              {result.formattedAddress ? (
                <span className="block truncate text-xs text-muted-foreground">
                  {result.formattedAddress}
                </span>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
      {showNoResults ? (
        <p className="mt-1 text-xs text-muted-foreground">No matching address found.</p>
      ) : null}
    </div>
  );
}
