import Link from "next/link";
import { notFound } from "next/navigation";
import { ContestActivity } from "@/app/admin/contests/[id]/contest-activity";
import { ContestDetailsForm } from "@/app/admin/contests/[id]/contest-details-form";
import { ContestEntries } from "@/app/admin/contests/[id]/contest-entries";
import {
  getAdminContest,
  listCatalogRestaurants,
} from "@/lib/restaurants/contest-admin";
import {
  contestBasePath,
  type ContestManagementBase,
} from "@/lib/restaurants/contest-admin-paths";

/**
 * SAN-1580 · the single contest-detail body used by `/admin/contests/[id]` and
 * `/app/contests/[id]`.
 *
 * It reuses the existing forms, entries/picker, activity trail and audited
 * actions. The caller has already passed the server gate; a missing or foreign
 * contest id renders the same 404 for every actor (no existence leak).
 */
export async function ContestAdminDetailView({
  userId,
  contestId,
  base,
}: {
  userId: string;
  contestId: string;
  base: ContestManagementBase;
}) {
  const detail = await getAdminContest(userId, contestId);
  if (!detail) notFound();

  const linkedIds = detail.entries
    .map((entry) => entry.restaurant_id)
    .filter((id): id is string => id !== null);
  const available = await listCatalogRestaurants(linkedIds);

  return (
    <>
      <nav className="mb-4 text-sm">
        <Link className="text-muted-foreground underline" href={contestBasePath(base)}>
          ← All contests
        </Link>
      </nav>

      <header className="mb-6">
        <h1 className="font-serif text-2xl font-semibold">{detail.contest.title}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {detail.contest.status} · {detail.contest.slug}
        </p>
      </header>

      <ContestDetailsForm contest={detail.contest} />
      <ContestEntries contestId={detail.contest.id} entries={detail.entries} available={available} />
      <ContestActivity audit={detail.audit} />
    </>
  );
}
