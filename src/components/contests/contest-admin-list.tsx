import Link from "next/link";
import { randomUUID } from "node:crypto";
import { createContestAction } from "@/app/admin/contests/actions";
import { listAdminContests } from "@/lib/restaurants/contest-admin";
import {
  contestBasePath,
  type ContestManagementBase,
} from "@/lib/restaurants/contest-admin-paths";

/**
 * SAN-1580 · the single contest list/create body used by `/admin/contests` and
 * `/app/contests`.
 *
 * It contains no authorization and no data plumbing of its own beyond the
 * existing `listAdminContests` read: the caller must have passed the server gate
 * first. Writes go through the existing audited `createContestAction`; the
 * `base` field is a short fixed token, never a URL.
 */
export function ContestAdminHeading() {
  return (
    <header className="mb-6">
      <h1 className="font-serif text-2xl font-semibold">Contests</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Create a restaurant contest, then add catalog restaurants as nominees.
      </p>
    </header>
  );
}

export async function ContestAdminList({
  userId,
  base,
}: {
  userId: string;
  base: ContestManagementBase;
}) {
  const contests = await listAdminContests(userId);
  // Generated on the server for this render. A retry of the same form carries the
  // same request id, so the RPC can return the original contest instead of a duplicate.
  const requestId = randomUUID();
  const basePath = contestBasePath(base);

  return (
    <>
      <section className="mb-8 rounded-lg border border-border/60 p-4">
        <h2 className="mb-3 text-sm font-semibold">Create a contest</h2>
        <form action={createContestAction} className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <input type="hidden" name="request_id" value={requestId} />
          {/* Fixed token, validated server-side. Never a user-supplied redirect target. */}
          <input type="hidden" name="base" value={base} />
          <label className="flex-1 text-sm">
            <span className="mb-1 block text-muted-foreground">Title</span>
            <input
              className="min-h-11 w-full rounded-md border border-border/60 bg-background px-3"
              name="title"
              required
              maxLength={120}
              placeholder="Medellín People’s Choice"
            />
          </label>
          <label className="flex-1 text-sm">
            <span className="mb-1 block text-muted-foreground">Description (optional)</span>
            <input
              className="min-h-11 w-full rounded-md border border-border/60 bg-background px-3"
              name="description"
              maxLength={400}
            />
          </label>
          <button
            className="min-h-11 rounded-md bg-primary px-4 font-medium text-primary-foreground"
            data-testid="contest-create-submit"
            type="submit"
          >
            Create contest
          </button>
        </form>
      </section>

      <section>
        <h2 className="mb-3 text-sm font-semibold">Restaurant contests</h2>
        {contests.length === 0 ? (
          <p data-testid="contests-empty" className="text-sm text-muted-foreground">
            No restaurant contests yet. Create the first one above.
          </p>
        ) : (
          <ul className="divide-y divide-border/60 rounded-lg border border-border/60">
            {contests.map((contest) => (
              <li
                key={contest.id}
                className="flex flex-wrap items-center justify-between gap-3 p-4"
                data-testid={"contest-row-" + contest.id}
              >
                <div>
                  <Link
                    className="font-medium underline"
                    href={basePath + "/" + contest.id}
                  >
                    {contest.title}
                  </Link>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {contest.status} · {contest.linked} linked of {contest.entries} entries
                  </p>
                </div>
                <span className="text-xs text-muted-foreground">{contest.slug}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
