import Link from "next/link";
import { notFound } from "next/navigation";
import { EmptyState } from "@/components/empty/empty-state";
import { ContestNomineeCard } from "@/components/restaurants/contest-nominee-card";
import {
  contestState,
  contestWindowLabel,
  getPublicContest,
  type ContestState,
} from "@/lib/restaurants/contest-public";

export const dynamic = "force-dynamic";

const STATE_LABEL: Record<ContestState, string> = {
  open: "Within contest window",
  upcoming: "Upcoming",
  closed: "Contest window ended",
  draft: "Draft",
  archived: "Archived",
};

export default async function ContestDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  if (id.trim().length === 0) notFound();

  const result = await getPublicContest(id);
  if (result.status === "not_found") notFound();
  if (result.status === "error") {
    return (
      <main className="mx-auto min-h-screen max-w-4xl px-4 py-8">
        <h1 className="font-serif text-2xl font-semibold">Contest</h1>
        <p className="mt-2 text-sm text-foreground" data-testid="contest-error">
          We could not load this contest right now. This is a temporary problem, not a missing contest.
        </p>
        <Link className="mt-4 inline-block text-sm underline" href="/contests">All contests</Link>
      </main>
    );
  }

  const { contest, nominees } = result;
  const state = contestState(contest);
  const window = contestWindowLabel(contest);

  return (
    <main className="mx-auto min-h-screen max-w-4xl px-4 py-8" data-testid="contest-page" data-contest-id={contest.id}>
      <nav className="mb-4 text-sm">
        <Link className="text-muted-foreground underline" href="/contests">All contests</Link>
      </nav>

      <header className="mb-6">
        <h1 className="font-serif text-3xl font-semibold" data-testid="contest-title">
          {contest.title}
        </h1>
        <p className="mt-2 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
          <span className="rounded-full border border-border/60 px-3 py-1 text-xs font-medium" data-testid="contest-state">
            {STATE_LABEL[state]}
          </span>
          {window ? <span>{window}</span> : null}
        </p>
      </header>

      <section aria-labelledby="contest-about" className="mb-8">
        <h2 className="mb-2 text-lg font-semibold" id="contest-about">About this contest</h2>
        {contest.description ? (
          <p className="text-sm text-foreground" data-testid="contest-description">{contest.description}</p>
        ) : (
          <p className="text-sm text-muted-foreground" data-testid="contest-no-rules">
            The organizer has not published rules for this contest yet.
          </p>
        )}
        <p className="mt-3 text-sm text-muted-foreground" data-testid="contest-vote-guidance">
          Open a participating restaurant to check its current voting options.
        </p>
      </section>

      <section aria-labelledby="contest-nominees">
        <h2 className="mb-3 text-lg font-semibold" id="contest-nominees">
          Restaurants on the ballot
        </h2>
        {nominees.length === 0 ? (
          <EmptyState
            description="The organizer has not added any restaurants to this contest yet."
            testId="contest-nominees-empty"
            title="No nominees yet"
          />
        ) : (
          <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2" data-testid="contest-nominees">
            {nominees.map((nominee) => (
              <ContestNomineeCard contestId={contest.id} key={nominee.entityId} nominee={nominee} />
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
