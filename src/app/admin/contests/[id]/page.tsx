import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getAdminContest, listCatalogRestaurants } from "@/lib/restaurants/contest-admin";
import { ContestDetailsForm } from "./contest-details-form";
import { ContestEntries } from "./contest-entries";
import { ContestActivity } from "./contest-activity";

export const dynamic = "force-dynamic";

/** SAN-1526 · edit one contest. Sections live in their own components. */
export default async function AdminContestDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ added?: string; already?: string }>;
}) {
  const { id } = await params;
  const query = await searchParams;
  const addedCount = Number(query.added ?? 0) || 0;
  const alreadyCount = Number(query.already ?? 0) || 0;
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

  const linkedIds = detail.entries
    .map((entry) => entry.restaurant_id)
    .filter((id): id is string => id !== null);
  const available = await listCatalogRestaurants(linkedIds);

  return (
    <main data-testid="admin-contest-detail" className="mx-auto min-h-screen max-w-5xl px-4 py-8">
      <nav className="mb-4 text-sm">
        <Link className="text-muted-foreground underline" href="/admin/contests">
          ← All contests
        </Link>
      </nav>

      <header className="mb-6">
        <h1 className="font-serif text-2xl font-semibold">{detail.contest.title}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {detail.contest.status} · {detail.contest.slug}
        </p>
      </header>

      {addedCount > 0 || alreadyCount > 0 ? (
        <p
          className="mb-4 rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900"
          data-testid="contest-link-result"
          role="status"
        >
          Added {addedCount} restaurant{addedCount === 1 ? "" : "s"}.
          {alreadyCount > 0 ? " " + alreadyCount + " already linked." : ""}
        </p>
      ) : null}

      <ContestDetailsForm contest={detail.contest} />
      <ContestEntries contestId={detail.contest.id} entries={detail.entries} available={available} />
      <ContestActivity audit={detail.audit} />
    </main>
  );
}