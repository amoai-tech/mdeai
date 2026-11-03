import Link from "next/link";
import { notFound } from "next/navigation";
import { cache } from "react";
import {
  ArrowLeft,
  ArrowUpRight,
  CalendarDays,
  CircleHelp,
  Trophy,
  UtensilsCrossed,
} from "lucide-react";
import { ContestNomineeGallery } from "@/components/restaurants/contest-nominee-gallery";
import { ContestCover, ContestStatusBadge } from "@/components/restaurants/contest-visuals";
import {
  contestDate,
  contestState,
  contestWindowLabel,
  getPublicContest,
  type ContestState,
  type PublicContest,
} from "@/lib/restaurants/contest-public";

export const dynamic = "force-dynamic";

// generateMetadata and the page body both need this read; React de-duplicates it per request.
const loadContest = cache(getPublicContest);

function describe(description: string | null): string {
  if (!description) return "See the Medellín restaurants competing in this contest and where to vote.";
  const text = description.replace(/\s+/g, " ").trim();
  return text.length > 155 ? text.slice(0, 152).trimEnd() + "…" : text;
}

/**
 * What a visitor can actually do right now. The stored status is not enough on its own: a live
 * contest with a past end date is closed, and a draft never accepts a ballot.
 */
function voteGuidance(state: ContestState, contest: PublicContest): string {
  const starts = contestDate(contest.startsAt);
  const ends = contestDate(contest.endsAt);
  switch (state) {
    case "open":
      return "Open a participating restaurant to check its voting options and confirm your ballot.";
    case "upcoming":
      return starts
        ? "Voting opens on " + starts + "."
        : "Voting has not opened yet.";
    case "closed":
      return ends
        ? "Voting closed on " + ends + "."
        : "Voting is closed for this contest.";
    case "archived":
      return "This edition is archived; voting is closed.";
    case "draft":
      return "This contest is still a draft, so voting has not opened.";
  }
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const result = await loadContest(id);
  if (result.status !== "found") {
    return { title: "Contest not found · mdeai", robots: { index: false } };
  }
  const { contest } = result;
  const title = contest.title + " · Restaurant contest";
  const description = describe(contest.description);
  return {
    title,
    description,
    openGraph: { title, description, type: "website" as const },
    twitter: { card: "summary_large_image" as const, title, description },
  };
}

export default async function ContestDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  if (id.trim().length === 0) notFound();

  const result = await loadContest(id);
  if (result.status === "not_found") notFound();
  if (result.status === "error") {
    return (
      <main
        className="mx-auto min-h-screen w-full max-w-3xl px-4 py-10 sm:px-6"
        id="main-content"
        tabIndex={-1}
      >
        <Link
          className="inline-flex min-h-11 items-center gap-1.5 text-sm font-medium text-muted-foreground underline-offset-4 hover:underline"
          href="/contests"
        >
          <ArrowLeft aria-hidden className="size-4" />
          All contests
        </Link>
        <div
          className="mt-6 rounded-3xl border border-dashed border-border bg-card px-6 py-10 text-center sm:px-10"
          data-testid="contest-error"
          role="status"
        >
          <h1 className="text-lg font-semibold tracking-tight">We couldn&apos;t load this contest</h1>
          <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-muted-foreground">
            This is a temporary problem, not a missing contest. Nothing has been deleted — retry in
            a moment.
          </p>
          <Link
            className="mt-5 inline-flex min-h-11 items-center justify-center rounded-xl border border-border bg-background px-5 text-sm font-semibold hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
            href="/contests"
          >
            Back to all contests
          </Link>
        </div>
      </main>
    );
  }

  const { contest, nominees } = result;
  const acceptedTotal = nominees.reduce((sum, nominee) => sum + nominee.audienceAccepted, 0);
  const testTotal = nominees.reduce((sum, nominee) => sum + nominee.developmentTestTotal, 0);
  const state = contestState(contest);
  const window = contestWindowLabel(contest);

  return (
    <main
      className="min-h-screen bg-background text-foreground"
      data-contest-id={contest.id}
      data-testid="contest-page"
      id="main-content"
      tabIndex={-1}
    >
      <div className="mx-auto w-full max-w-[1240px] px-4 pb-16 sm:px-6 lg:px-8">
        <nav aria-label="Breadcrumb" className="pt-6">
          <Link
            className="inline-flex min-h-11 items-center gap-1.5 text-sm font-medium text-muted-foreground underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
            href="/contests"
          >
            <ArrowLeft aria-hidden className="size-4" />
            All contests
          </Link>
        </nav>

        <section
          aria-labelledby="contest-title"
          className="grid items-start gap-8 pb-10 pt-2 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)] lg:gap-12 lg:pb-14"
        >
          <div>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
              <ContestStatusBadge state={state} />
              {window ? (
                <span className="inline-flex items-center gap-1.5 text-sm text-muted-foreground">
                  <CalendarDays aria-hidden className="size-4" />
                  {window}
                </span>
              ) : null}
              <span className="text-sm text-muted-foreground">
                {nominees.length} restaurant{nominees.length === 1 ? "" : "s"} on the ballot
              </span>
            </div>

            <h1
              className="mt-4 max-w-[20ch] text-balance font-serif text-[2.125rem] font-semibold leading-[1.08] tracking-[-0.03em] sm:text-[2.75rem] lg:text-[3.25rem]"
              data-testid="contest-title"
              id="contest-title"
            >
              {contest.title}
            </h1>

            {contest.description ? (
              <p
                className="mt-4 max-w-prose text-pretty text-base leading-relaxed text-foreground sm:text-[17px]"
                data-testid="contest-description"
              >
                {contest.description}
              </p>
            ) : (
              <p
                className="mt-4 max-w-prose text-sm leading-relaxed text-muted-foreground"
                data-testid="contest-no-rules"
              >
                The organizer has not published rules for this contest yet.
              </p>
            )}

            {state === "draft" ? (
              <div
                className="mt-6 rounded-2xl border border-amber-600/25 bg-amber-500/10 px-4 py-4"
                data-testid="contest-draft-note"
              >
                <div className="flex items-start gap-3" data-testid="contest-vote-guidance">
                  <CircleHelp
                    aria-hidden
                    className="mt-0.5 size-5 shrink-0 text-amber-700 dark:text-amber-300"
                  />
                  <div className="text-sm leading-relaxed text-amber-900 dark:text-amber-200">
                    <p className="font-semibold">
                      Draft — this contest is not open for voting yet.
                    </p>
                    <p className="mt-1">
                      One ballot per account, per contest. The organizer can still change its
                      dates, description and nominees — voting opens when the contest is published.
                    </p>
                  </div>
                </div>
              </div>
            ) : (
              <div
                className="mt-6 flex items-start gap-3 rounded-2xl border border-border/70 bg-card px-4 py-4"
                data-testid="contest-vote-guidance"
              >
                <CircleHelp aria-hidden className="mt-0.5 size-5 shrink-0 text-primary" />
                <div className="text-sm leading-relaxed">
                  <p className="font-semibold text-foreground">
                    One ballot per account, per contest.
                  </p>
                  <p className="mt-0.5 text-muted-foreground">{voteGuidance(state, contest)}</p>
                </div>
              </div>
            )}
          </div>

          <ContestCover
            className="aspect-[4/3] w-full rounded-3xl border border-border/60 shadow-[0_10px_34px_-24px_oklch(0.4_0.05_180)]"
            coverUrl={contest.coverUrl}
            priority
            sizes="(max-width: 1024px) 100vw, 44vw"
            title={contest.title}
          />
        </section>

        <section
          aria-labelledby="contest-nominees-heading"
          className="border-t border-border/70 pt-10 sm:pt-12"
        >
          <div className="flex flex-col gap-2">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">
              01 · The ballot
            </p>
            <h2
              className="text-balance font-serif text-2xl font-semibold tracking-tight sm:text-3xl"
              id="contest-nominees-heading"
            >
              Restaurants on the ballot
            </h2>
            <p className="max-w-2xl text-pretty text-sm leading-relaxed text-muted-foreground sm:text-base">
              {nominees.length > 0
                ? "Open a restaurant to see its real details and its voting options for this contest."
                : "The organizer has not added any restaurants to this contest yet."}
            </p>
          </div>

          <div className="mt-6">
            {nominees.length === 0 ? (
              <div
                className="rounded-3xl border border-dashed border-border bg-card px-6 py-12 text-center sm:px-10"
                data-testid="contest-nominees-empty"
                role="status"
              >
                <span className="mx-auto flex size-11 items-center justify-center rounded-full bg-primary/10">
                  <UtensilsCrossed aria-hidden className="size-5 text-primary" />
                </span>
                <h3 className="mt-4 text-lg font-semibold tracking-tight">No nominees yet</h3>
                <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-muted-foreground">
                  Restaurants appear here once the organizer adds them. Nothing is ranked before
                  there is a ballot.
                </p>
                <Link
                  className="mt-5 inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-border bg-background px-5 text-sm font-semibold hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                  href="/restaurants"
                >
                  Browse restaurants
                  <ArrowUpRight aria-hidden className="size-4" />
                </Link>
              </div>
            ) : (
              <ContestNomineeGallery contestId={contest.id} nominees={nominees} />
            )}
          </div>
        </section>

        <section aria-labelledby="contest-standings-heading" className="mt-12 border-t border-border/70 pt-10 sm:mt-14 sm:pt-12">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">
                02 · Results
              </p>
              <h2
                className="mt-2 text-balance font-serif text-2xl font-semibold tracking-tight sm:text-3xl"
                id="contest-standings-heading"
              >
                Standings
              </h2>
            </div>
            {acceptedTotal > 0 ? (
              <span className="rounded-full border border-border bg-muted px-3 py-1 text-xs font-semibold text-muted-foreground">
                Provisional
              </span>
            ) : null}
          </div>

          <div
            className="mt-5 max-w-3xl rounded-2xl border border-border/70 bg-card p-5 sm:p-6"
            data-testid="contest-standings"
          >
            <Trophy aria-hidden className="size-5 text-muted-foreground" />
            <p className="mt-3 text-sm text-foreground" data-testid="standings-summary">
              <span className="font-semibold">{acceptedTotal}</span> accepted audience vote
              {acceptedTotal === 1 ? "" : "s"}
              <span className="mx-2 text-muted-foreground">·</span>
              <span className="font-semibold">{testTotal}</span> development test vote
              {testTotal === 1 ? "" : "s"}
            </p>
            <p className="mt-1 text-sm leading-relaxed text-muted-foreground" data-testid="standings-state">
              {acceptedTotal === 0
                ? "No accepted votes yet — there is no leader or winner."
                : "Current leaders, not a certified winner. Development test votes are shown separately and never counted."}
            </p>
            <p className="mt-3 border-t border-border/70 pt-3 text-xs leading-relaxed text-muted-foreground">
              An official winner is only published after an audited result. Ballot order and
              standings are not a promise of the final outcome.
            </p>
          </div>
        </section>

        <footer className="mt-12 border-t border-border/70 pt-6 text-sm">
          <Link
            className="inline-flex min-h-11 items-center gap-1.5 font-medium text-foreground underline underline-offset-4 hover:text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
            href="/restaurants"
          >
            Browse all restaurants
            <ArrowUpRight aria-hidden className="size-4" />
          </Link>
        </footer>
      </div>
    </main>
  );
}
