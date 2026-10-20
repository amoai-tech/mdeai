import Image from "next/image";
import Link from "next/link";
import { EmptyState } from "@/components/empty/empty-state";
import { isRenderableRemoteImage } from "@/lib/images/remote-image-hosts";
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

const STATE_DOT: Record<ContestState, string> = {
  open: "bg-emerald-500",
  upcoming: "bg-sky-500",
  closed: "bg-muted-foreground/50",
  draft: "bg-amber-500",
  archived: "bg-muted-foreground/50",
};

function ContestCover({ contest }: { contest: PublicContestSummary }) {
  const cover = contest.coverUrl;
  if (cover && isRenderableRemoteImage(cover)) {
    return (
      <Image
        alt=""
        aria-hidden
        className="h-40 w-full object-cover sm:h-48"
        height={384}
        src={cover}
        width={768}
      />
    );
  }
  // No cover yet: an intentional typographic panel, not a broken image.
  return (
    <div
      aria-hidden
      className="flex h-24 w-full items-center bg-gradient-to-br from-primary/15 via-primary/5 to-transparent px-5 sm:h-28"
    >
      <span className="font-serif text-2xl text-primary/70">
        {(contest.title.match(/[a-z0-9]/i)?.[0] ?? "C").toUpperCase()}
      </span>
    </div>
  );
}

function ContestCard({ contest }: { contest: PublicContestSummary }) {
  const state = contestState(contest);
  const window = contestWindowLabel(contest);
  const href = "/contests/" + contest.slug;

  return (
    <li
      className="group overflow-hidden rounded-2xl border border-border/60 transition-colors hover:border-primary/40 focus-within:border-primary/40 hover:shadow-sm"
      data-testid={"contest-card-" + contest.slug}
    >
      <Link className="block focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary" href={href}>
      <ContestCover contest={contest} />
      <div className="space-y-3 p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <h2 className="text-balance text-xl font-semibold tracking-tight">
            {contest.title}
          </h2>
          <span
            className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-border/60 px-2.5 py-1 text-xs font-medium text-muted-foreground"
            data-testid="contest-state"
          >
            <span aria-hidden className={"size-1.5 rounded-full " + STATE_DOT[state]} />
            {STATE_LABEL[state]}
          </span>
        </div>
        {window ? <p className="text-xs text-muted-foreground">{window}</p> : null}
        {contest.description ? (
          <p className="line-clamp-3 text-sm leading-relaxed text-foreground">{contest.description}</p>
        ) : null}
        <p className="flex items-center justify-between border-t border-border/40 pt-3 text-sm">
          <span className="text-muted-foreground">
            {contest.nominees} restaurant{contest.nominees === 1 ? "" : "s"} on the ballot
          </span>
          <span className="font-medium text-primary group-hover:underline" aria-hidden>
            View contest →
          </span>
        </p>
      </div>
      </Link>
    </li>
  );
}

/**
 * Exactly one public contest: a grid leaves an empty column and reads unfinished. This gives the
 * single real contest a deliberate featured treatment instead of entering the two-column loop.
 * Zero, one and many each get their own layout, all from the same canonical read.
 */
function FeaturedContest({ contest }: { contest: PublicContestSummary }) {
  const state = contestState(contest);
  const window = contestWindowLabel(contest);
  const href = "/contests/" + contest.slug;
  const cover = contest.coverUrl;
  const hasCover = Boolean(cover && isRenderableRemoteImage(cover));

  return (
    <article
      className="group overflow-hidden rounded-3xl border border-border/60 transition-colors hover:border-primary/40 focus-within:border-primary/40"
      data-testid={"contest-card-" + contest.slug}
      data-featured="true"
    >
      <Link className="grid focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary md:grid-cols-[1.1fr_1fr]" href={href}>
        <div className="order-2 flex flex-col justify-between gap-6 p-6 sm:p-10 md:order-1">
          <div className="space-y-4">
            <span
              className="inline-flex items-center gap-1.5 rounded-full border border-border/60 px-2.5 py-1 text-xs font-medium text-muted-foreground"
              data-testid="contest-state"
            >
              <span aria-hidden className={"size-1.5 rounded-full " + STATE_DOT[state]} />
              {STATE_LABEL[state]}
            </span>
            <h2 className="text-balance font-serif text-3xl font-semibold tracking-tight sm:text-4xl">
              {contest.title}
            </h2>
            {window ? <p className="text-sm text-muted-foreground">{window}</p> : null}
            {contest.description ? (
              <p className="max-w-prose text-pretty text-base leading-relaxed text-foreground">
                {contest.description}
              </p>
            ) : null}
          </div>
          <div className="flex flex-wrap items-center gap-4">
            <span className="rounded-lg bg-primary px-5 py-3 text-sm font-medium text-primary-foreground">
              View contest
            </span>
            <span className="text-sm text-muted-foreground">
              {contest.nominees} restaurant{contest.nominees === 1 ? "" : "s"} on the ballot
            </span>
          </div>
        </div>

        <div className="order-1 min-h-40 md:order-2">
          {hasCover && cover ? (
            <Image
              alt=""
              aria-hidden
              className="h-40 w-full object-cover md:h-full"
              height={640}
              src={cover}
              width={800}
            />
          ) : (
            // Typography-first panel: no empty image slot, no invented photography.
            <div
              aria-hidden
              className="flex h-full min-h-40 items-end bg-gradient-to-br from-primary/20 via-primary/5 to-transparent p-6"
            >
              <span className="font-serif text-6xl leading-none text-primary/30">
                {(contest.title.match(/[a-z0-9]/i)?.[0] ?? "C").toUpperCase()}
              </span>
            </div>
          )}
        </div>
      </Link>
    </article>
  );
}
export default async function ContestsPage() {
  const result = await listPublicContests();

  return (
    <main className="mx-auto min-h-screen max-w-5xl px-4 py-10 sm:px-6" data-testid="contests-page">
      <header className="mb-8 max-w-2xl">
        <p className="text-xs font-medium uppercase tracking-[0.14em] text-primary">Medellín</p>
        <h1 className="mt-2 text-balance font-serif text-4xl font-semibold tracking-tight sm:text-5xl">
          Restaurant contests
        </h1>
        <p className="mt-3 text-pretty text-base leading-relaxed text-muted-foreground">
          The restaurants competing in each contest, and where to cast your vote.
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
      ) : result.contests.length === 1 ? (
        <FeaturedContest contest={result.contests[0]} />
      ) : (
        <ul className="grid grid-cols-1 gap-5 md:grid-cols-2" data-testid="contests-list">
          {result.contests.map((contest) => (
            <ContestCard contest={contest} key={contest.id} />
          ))}
        </ul>
      )}

      <p className="mt-10 text-xs text-muted-foreground">
        <Link className="underline" href="/restaurants">Browse all restaurants</Link>
      </p>
    </main>
  );
}
