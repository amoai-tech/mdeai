import Link from "next/link";
import type { AdminContestEntry, CatalogRestaurant } from "@/lib/restaurants/contest-admin";
import { linkRestaurantAction, unlinkRestaurantAction } from "../actions";

/** SAN-1526 · nominees: link, unlink (ballots preserved), and the catalog picker. */
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
              key={entry.entity_id}
              className="flex flex-wrap items-center justify-between gap-3 p-4"
              data-testid={"contest-entry-" + entry.entity_id}
            >
              <div>
                <p className="font-medium">{entry.display_name}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {entry.ballots} ballot{entry.ballots === 1 ? "" : "s"} ·{" "}
                  {entry.restaurant_id ? "linked" : "unlinked (ballots preserved)"}
                </p>
              </div>
              {entry.restaurant_id ? (
                <form action={unlinkRestaurantAction}>
                  <input type="hidden" name="contest_id" value={contestId} />
                  <input type="hidden" name="restaurant_id" value={entry.restaurant_id} />
                  <button
                    className="min-h-11 rounded-md border border-border/60 px-4 text-sm"
                    data-testid={"contest-unlink-" + entry.entity_id}
                    type="submit"
                  >
                    Remove
                  </button>
                </form>
              ) : null}
            </li>
          ))}
        </ul>
      )}

      {available.length > 0 ? (
        <form action={linkRestaurantAction} className="mt-4 flex flex-wrap items-end gap-3">
          <input type="hidden" name="contest_id" value={contestId} />
          <label className="text-sm">
            <span className="mb-1 block text-muted-foreground">Add a restaurant</span>
            <select
              className="min-h-11 rounded-md border border-border/60 bg-background px-3"
              name="restaurant_id"
              required
              defaultValue=""
            >
              <option value="" disabled>
                Choose from the catalog
              </option>
              {available.map((restaurant) => (
                <option key={restaurant.id} value={restaurant.id}>
                  {restaurant.name}
                  {restaurant.neighborhood ? " · " + restaurant.neighborhood : ""}
                </option>
              ))}
            </select>
          </label>
          <button
            className="min-h-11 rounded-md bg-primary px-4 font-medium text-primary-foreground"
            data-testid="contest-link-submit"
            type="submit"
          >
            Add restaurant
          </button>
        </form>
      ) : (
        <p className="mt-4 text-sm text-muted-foreground">Every active restaurant is already a nominee.</p>
      )}
      <p className="mt-3 text-xs text-muted-foreground">
        Removing a restaurant unlinks it; existing ballots are preserved.{" "}
        <Link className="underline" href="/restaurants">View the public directory</Link>
      </p>
    </section>
  );
}