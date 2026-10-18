import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getAdminContest, listCatalogRestaurants } from "@/lib/restaurants/contest-admin";
import { linkRestaurantAction, unlinkRestaurantAction, updateContestAction } from "../actions";

export const dynamic = "force-dynamic";

const STATUSES = ["draft", "live", "closed", "archived"] as const;

function toLocalInput(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toISOString().slice(0, 16);
}

/** SAN-1526 · edit one contest: fields, status, linked restaurants, activity. */
export default async function AdminContestDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let isAdmin = false;
  if (user) {
    const { data } = await supabase.rpc("is_admin");
    isAdmin = data === true;
  }

  if (!user || !isAdmin) {
    return (
      <main className="mx-auto min-h-screen max-w-3xl px-4 py-8">
        <h1 className="font-serif text-2xl font-semibold">Contest</h1>
        <p data-testid="admin-not-authorized" className="mt-2 text-sm text-muted-foreground">
          {user ? "Admin access required." : "Sign in as an admin to manage contests."}
        </p>
      </main>
    );
  }

  const detail = await getAdminContest(user.id, id);
  if (!detail) notFound();

  const catalog = await listCatalogRestaurants();
  const linkedIds = new Set(detail.entries.map((entry) => entry.restaurant_id).filter(Boolean));
  const available = catalog.filter((restaurant) => !linkedIds.has(restaurant.id));

  return (
    <main data-testid="admin-contest-detail" className="mx-auto min-h-screen max-w-5xl px-4 py-8">
      <nav className="mb-4 text-sm">
        <Link className="text-muted-foreground underline" href="/admin/contests">
          {"←"} All contests
        </Link>
      </nav>

      <header className="mb-6">
        <h1 className="font-serif text-2xl font-semibold">{detail.contest.title}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {detail.contest.status} · {detail.contest.slug}
        </p>
      </header>

      <section className="mb-8 rounded-lg border border-border/60 p-4">
        <h2 className="mb-3 text-sm font-semibold">Contest details</h2>
        <form action={updateContestAction} className="grid gap-3 sm:grid-cols-2">
          <input type="hidden" name="contest_id" value={detail.contest.id} />
          <label className="text-sm sm:col-span-2">
            <span className="mb-1 block text-muted-foreground">Title</span>
            <input
              className="min-h-11 w-full rounded-md border border-border/60 bg-background px-3"
              name="title"
              defaultValue={detail.contest.title}
              maxLength={120}
            />
          </label>
          <label className="text-sm sm:col-span-2">
            <span className="mb-1 block text-muted-foreground">Description</span>
            <textarea
              className="min-h-20 w-full rounded-md border border-border/60 bg-background px-3 py-2"
              name="description"
              defaultValue={detail.contest.description ?? ""}
              maxLength={400}
            />
          </label>
          <label className="text-sm">
            <span className="mb-1 block text-muted-foreground">Status</span>
            <select
              className="min-h-11 w-full rounded-md border border-border/60 bg-background px-3"
              name="status"
              defaultValue={detail.contest.status}
            >
              {STATUSES.map((status) => (
                <option key={status} value={status}>
                  {status}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm">
            <span className="mb-1 block text-muted-foreground">Starts</span>
            <input
              className="min-h-11 w-full rounded-md border border-border/60 bg-background px-3"
              type="datetime-local"
              name="starts_at"
              defaultValue={toLocalInput(detail.contest.starts_at)}
            />
          </label>
          <label className="text-sm">
            <span className="mb-1 block text-muted-foreground">Ends</span>
            <input
              className="min-h-11 w-full rounded-md border border-border/60 bg-background px-3"
              type="datetime-local"
              name="ends_at"
              defaultValue={toLocalInput(detail.contest.ends_at)}
            />
          </label>
          <div className="sm:col-span-2">
            <button
              className="min-h-11 rounded-md bg-primary px-4 font-medium text-primary-foreground"
              data-testid="contest-update-submit"
              type="submit"
            >
              Save changes
            </button>
          </div>
        </form>
      </section>

      <section className="mb-8">
        <h2 className="mb-3 text-sm font-semibold">Nominees</h2>
        {detail.entries.length === 0 ? (
          <p data-testid="contest-entries-empty" className="text-sm text-muted-foreground">
            No restaurants added yet.
          </p>
        ) : (
          <ul className="divide-y divide-border/60 rounded-lg border border-border/60">
            {detail.entries.map((entry) => (
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
                    <input type="hidden" name="contest_id" value={detail.contest.id} />
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
            <input type="hidden" name="contest_id" value={detail.contest.id} />
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
      </section>

      <section>
        <h2 className="mb-3 text-sm font-semibold">Activity</h2>
        {detail.audit.length === 0 ? (
          <p className="text-sm text-muted-foreground">No changes recorded yet.</p>
        ) : (
          <ul className="space-y-2 text-sm">
            {detail.audit.map((row, index) => (
              <li key={index} className="rounded-md border border-border/60 p-3">
                <span className="font-medium">{row.action}</span>{" "}
                <span className="text-muted-foreground">
                  · {row.origin} · {new Date(row.created_at).toLocaleString()}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}