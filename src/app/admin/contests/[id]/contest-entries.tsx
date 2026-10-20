import Link from "next/link";
import type { AdminContestEntry, CatalogRestaurant } from "@/lib/restaurants/contest-admin";
import { RestaurantPicker } from "./restaurant-picker";
import { RemoveNomineeButton } from "./remove-nominee-button";

/**
 * SAN-1543 · nominees: the catalog picker, the current ballot, and a guarded removal.
 *
 * The picker is a client component because a native multi-select cannot be used on a phone.
 * The nominee list stays server-rendered so ballot counts are always read from the database.
 */
export function ContestEntries({
  contestId,
  entries,
  available,
}: {
  contestId: string;
  entries: AdminContestEntry[];
  available: CatalogRestaurant[];
}) {
  return (
    <section className="mb-8">
      <h2 className="mb-3 text-sm font-semibold">Nominees</h2>
      {entries.length === 0 ? (
        <p data-testid="contest-entries-empty" className="text-sm text-muted-foreground">
          No restaurants added yet.
        </p>
      ) : (
        <ul className="divide-y divide-border/60 rounded-lg border border-border/60">
          {entries.map((entry) => (
            <li
              className="flex flex-wrap items-center justify-between gap-3 p-4"
              data-testid={"contest-entry-" + entry.entity_id}
              key={entry.entity_id}
            >
              <div>
                <p className="font-medium">{entry.display_name}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {entry.ballots} ballot{entry.ballots === 1 ? "" : "s"} ·{" "}
                  {entry.restaurant_id ? "linked" : "unlinked (ballots preserved)"}
                </p>
              </div>
              {entry.restaurant_id ? (
                <RemoveNomineeButton
                  contestId={contestId}
                  name={entry.display_name}
                  restaurantId={entry.restaurant_id}
                />
              ) : null}
            </li>
          ))}
        </ul>
      )}

      {available.length > 0 ? (
        <RestaurantPicker
          available={available.map((restaurant) => ({
            id: restaurant.id,
            name: restaurant.name,
            neighborhood: restaurant.neighborhood ?? null,
          }))}
          contestId={contestId}
        />
      ) : (
        <p className="mt-4 text-sm text-muted-foreground">
          Every active restaurant is already a nominee.
        </p>
      )}
      <p className="mt-3 text-xs text-muted-foreground">
        Removing a restaurant unlinks it; existing ballots are preserved.{" "}
        <Link className="underline" href="/restaurants">View the public directory</Link>
      </p>
    </section>
  );
}