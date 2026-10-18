import Link from "next/link";
import { randomUUID } from "node:crypto";
import { createClient } from "@/lib/supabase/server";
import { listAdminContests } from "@/lib/restaurants/contest-admin";
import { createContestAction } from "./actions";

export const metadata = {
  title: "Contests · Admin · mdeai",
};

/**
 * SAN-1526 · Super Admin contest list + create.
 * Server-gated: only signed-in admins reach the data, and every write goes through a server
 * action that re-checks the role before calling a service-role RPC.
 */
export default async function AdminContestsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let isAdmin = false;
  if (user) {
    const { data } = await supabase.rpc("is_admin");
    isAdmin = data === true;
  }

  const contests = user && isAdmin ? await listAdminContests(user.id) : [];
  const requestId = randomUUID();

  return (
    <main data-testid="admin-contests-page" className="mx-auto min-h-screen max-w-5xl px-4 py-8">
      <header className="mb-6">
        <h1 className="font-serif text-2xl font-semibold">Contests</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Create a restaurant contest, then add catalog restaurants as nominees.
        </p>
      </header>

      {!user ? (
        <p className="text-sm text-muted-foreground" data-testid="admin-sign-in-required">
          Sign in as an admin to manage contests.
        </p>
      ) : !isAdmin ? (
        <p data-testid="admin-not-authorized" className="text-sm text-muted-foreground">
          Admin access required.
        </p>
      ) : (
        <>
          <section className="mb-8 rounded-lg border border-border/60 p-4">
            <h2 className="mb-3 text-sm font-semibold">Create a contest</h2>
            <form action={createContestAction} className="flex flex-col gap-3 sm:flex-row sm:items-end">
              <input type="hidden" name="request_id" value={requestId} />
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
                      <Link className="font-medium underline" href={"/admin/contests/" + contest.id}>
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
      )}
    </main>
  );
}