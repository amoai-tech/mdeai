import Link from "next/link";
import { EmptyState } from "@/components/empty/empty-state";
import {
  contestState,
  contestWindowLabel,
  listPublicContests,
  type ContestState,
  type PublicContestSummary,
} from "@/lib/restaurants/contest-public";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Restaurant contests · mdeai",
  description: "Discover Medellín restaurant contests and vote for the restaurants you love.",
};

const STATE_LABEL: Record<ContestState, string> = {
  open: "Within contest window",
  upcoming: "Upcoming",
  closed: "Contest window ended",
  draft: "Draft",
  archived: "Archived",
};

const STATE_STYLE: Record<ContestState, string> = {
  open: "border-emerald-200 bg-emerald-50 text-emerald-900",
  upcoming: "border-sky-200 bg-sky-50 text-sky-900",
  closed: "border-border/60 bg-muted text-muted-foreground",
  draft: "border-amber-200 bg-amber-50 text-amber-900",
  archived: "border-border/60 bg-muted text-muted-foreground",
};

function ContestCard({ contest }: { contest: PublicContestSummary }) {
  const state = contestState(contest);
  const window = contestWindowLabel(contest);

  return (
    <li className="rounded-xl border border-border/60 p-5" data-testid={"contest-card-" + contest.slug}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-semibold">
          <Link className="underline" href={"/contests/" + contest.slug}>
            {contest.title}
          </Link>
        </h2>
        <span
          className={"rounded-full border px-3 py-1 text-xs font-medium " + STATE_STYLE[state]}
          data-testid="contest-state"
        >
          {STATE_LABEL[state]}
        </span>
      </div>
      {window ? <p className="mt-1 text-xs text-muted-foreground">{window}</p> : null}
      {contest.description ? (
        <p className="mt-3 text-sm text-foreground">{contest.description}</p>
      ) : null}
      <p className="mt-3 text-sm text-muted-foreground">
        {contest.nominees} restaurant{contest.nominees === 1 ? "" : "s"} on the ballot
      </p>
    </li>
  );
}

export default async function ContestsPage() {
  const result = await listPublicContests();

  return (
    <main className="mx-auto min-h-screen max-w-5xl px-4 py-8" data-testid="contests-page">
      <header className="mb-6">
        <h1 className="font-serif text-3xl font-semibold">Restaurant contests</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Medellín restaurant contests, the restaurants competing in each, and where to vote.
        </p>
      </header>

      {result.status === "error" ? (
        <p className="text-sm text-foreground" data-testid="contests-error">
          We could not load the contests right now. This is a temporary problem, not an empty list.
        </p>
      ) : result.contests.length === 0 ? (
        <EmptyState
          description="Contests appear here as soon as an organizer publishes one."
          testId="contests-empty"
          title="No restaurant contests yet"
        />
      ) : (
        <ul className="space-y-4" data-testid="contests-list">
          {result.contests.map((contest) => (
            <ContestCard contest={contest} key={contest.id} />
          ))}
        </ul>
      )}

      <p className="mt-8 text-xs text-muted-foreground">
        <Link className="underline" href="/restaurants">Browse all restaurants</Link>
      </p>
    </main>
  );
}
