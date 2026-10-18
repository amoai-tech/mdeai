"use client";

/**
 * SAN-1543 · searchable, touch-friendly nominee picker.
 *
 * Replaces a native `<select multiple>`, which needs Ctrl/Cmd and is unusable at 390px. Selection
 * is independent of the filter, so searching never clears what is already ticked.
 */
import { useActionState, useMemo, useState } from "react";
import { useFormStatus } from "react-dom";
import { linkRestaurantsAction, type BulkLinkState } from "../actions";

type PickerRestaurant = { id: string; name: string; neighborhood: string | null };

const INITIAL: BulkLinkState = { status: "idle", added: 0, already: 0, failed: [], rejected: 0 };

function SubmitButton({ count }: { count: number }) {
  const { pending } = useFormStatus();
  return (
    <button
      className="min-h-11 rounded-md bg-primary px-4 font-medium text-primary-foreground disabled:opacity-60"
      data-testid="contest-link-submit"
      disabled={pending || count === 0}
      type="submit"
    >
      {pending ? "Adding…" : count === 0 ? "Add selected" : "Add " + count + " selected"}
    </button>
  );
}

export function RestaurantPicker({
  contestId,
  available,
}: {
  contestId: string;
  available: PickerRestaurant[];
}) {
  const [state, formAction] = useActionState(linkRestaurantsAction, INITIAL);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<string[]>([]);

  const nameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const restaurant of available) map.set(restaurant.id, restaurant.name);
    return map;
  }, [available]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return available;
    return available.filter(
      (restaurant) =>
        restaurant.name.toLowerCase().includes(q) ||
        (restaurant.neighborhood ?? "").toLowerCase().includes(q),
    );
  }, [available, query]);

  // After a successful save the server re-renders a smaller catalog. Anything no longer offered
  // cannot remain selected, so the count and the submitted ids always describe real options.
  const effectiveSelected = selected.filter((id) => nameById.has(id));

  const toggle = (id: string) =>
    setSelected((current) =>
      current.includes(id) ? current.filter((value) => value !== id) : [...current, id],
    );

  const selectVisible = () =>
    setSelected((current) => [...new Set([...current, ...visible.map((r) => r.id)])]);
  const selectAll = () => setSelected(available.map((r) => r.id));
  const clear = () => setSelected([]);

  return (
    <div className="mt-4 space-y-3" data-testid="restaurant-picker">
      <label className="block text-sm">
        <span className="mb-1 block text-muted-foreground">Search the catalog</span>
        <input
          className="min-h-11 w-full rounded-md border border-border/60 bg-background px-3"
          data-testid="contest-picker-search"
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Name or neighborhood"
          type="search"
          value={query}
        />
      </label>

      <div className="flex flex-wrap gap-2">
        <button className="min-h-11 rounded-md border border-border/60 px-3 text-sm" data-testid="contest-picker-select-visible" onClick={selectVisible} type="button">
          Select {visible.length === available.length ? "all" : "visible"} ({visible.length})
        </button>
        <button className="min-h-11 rounded-md border border-border/60 px-3 text-sm" data-testid="contest-picker-select-all" onClick={selectAll} type="button">
          Select all {available.length}
        </button>
        <button className="min-h-11 rounded-md border border-border/60 px-3 text-sm" data-testid="contest-picker-clear" onClick={clear} type="button">
          Clear
        </button>
      </div>

      <p className="text-sm text-muted-foreground" data-testid="contest-picker-count" role="status">
        {effectiveSelected.length} selected
      </p>

      <ul className="max-h-72 divide-y divide-border/60 overflow-y-auto rounded-md border border-border/60">
        {visible.length === 0 ? (
          <li className="p-3 text-sm text-muted-foreground">No restaurant matches that search.</li>
        ) : (
          visible.map((restaurant) => (
            <li key={restaurant.id}>
              <label className="flex min-h-11 cursor-pointer items-center gap-3 px-3 text-sm">
                <input
                  checked={selected.includes(restaurant.id)}
                  className="h-5 w-5"
                  data-restaurant-name={restaurant.name}
                  data-testid="contest-picker-option"
                  onChange={() => toggle(restaurant.id)}
                  type="checkbox"
                />
                <span>
                  {restaurant.name}
                  {restaurant.neighborhood ? (
                    <span className="text-muted-foreground"> · {restaurant.neighborhood}</span>
                  ) : null}
                </span>
              </label>
            </li>
          ))
        )}
      </ul>

      <form action={formAction}>
        <input name="contest_id" type="hidden" value={contestId} />
        {effectiveSelected.map((id) => (
          <input key={id} name="restaurant_ids" type="hidden" value={id} />
        ))}
        <SubmitButton count={effectiveSelected.length} />
      </form>

      {state.status !== "idle" ? (
        <div
          className={
            state.status === "success" && state.rejected === 0
              ? "rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900"
              : "rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900"
          }
          data-testid="contest-link-result"
          role="status"
        >
          {state.message ? <p>{state.message}</p> : null}
          {state.status !== "error" ? (
            <p data-testid="contest-link-result-summary">
              {state.added} added · {state.already} already linked
              {state.failed.length > 0 ? " · " + state.failed.length + " failed" : ""}
              {state.rejected > 0 ? " · " + state.rejected + " invalid id skipped" : ""}
            </p>
          ) : null}
          {state.failed.length > 0 ? (
            <ul className="mt-2 list-disc pl-5" data-testid="contest-link-failures">
              {state.failed.map((failure) => (
                <li key={failure.id}>
                  {(nameById.get(failure.id) ?? failure.id) + " — " + failure.reason}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}