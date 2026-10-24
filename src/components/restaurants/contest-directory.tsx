import Link from "next/link";
import { Suspense } from "react";
import {
  ArrowUpRight,
  CalendarDays,
  RotateCw,
  SearchX,
  UtensilsCrossed,
} from "lucide-react";
import {
  ContestCover,
  ContestEditorialArt,
  ContestStatusBadge,
} from "@/components/restaurants/contest-visuals";
import { Skeleton } from "@/components/ui/skeleton";
import {
  contestState,
  contestWindowLabel,
  listPublicContests,
  type ContestState,
  type PublicContestSummary,
} from "@/lib/restaurants/contest-public";
import { cn } from "@/lib/utils";

/**
 * SAN-1524 · the public contest directory.
 *
 * The route file is a thin wrapper so this module owns one thing: the premium, source-backed
 * directory. Every value below comes from `contest_public_list`; nothing is invented here.
 */

/**
 * Discovery filters are real links, not client state: the page is already a server read, so a
 * filtered view is shareable and survives a back navigation without hydration.
 *
 * "Finished" intentionally includes archived contests — an archived edition is still a finished
 * one from a visitor's point of view, and inventing a sixth chip for it would only add noise.
 */
export type ContestFilter = "all" | "open" | "upcoming" | "closed" | "draft";

export const CONTEST_FILTERS: { value: ContestFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "open", label: "Voting open" },
  { value: "upcoming", label: "Upcoming" },
  { value: "closed", label: "Finished" },
  { value: "draft", label: "Draft" },
];

function matchesFilter(state: ContestState, filter: ContestFilter): boolean {
  if (filter === "all") return true;
  if (filter === "closed") return state === "closed" || state === "archived";
  return state === filter;
}

export function filterHref(filter: ContestFilter): string {
  return filter === "all" ? "/contests" : "/contests?status=" + filter;
}

export function normalizeFilter(raw: string | string[] | undefined): ContestFilter {
  const value = Array.isArray(raw) ? raw[0] : raw;
  return CONTEST_FILTERS.find((filter) => filter.value === value)?.value ?? "all";
}

function nomineeLabel(count: number): string {
  return count + (count === 1 ? " restaurant on the ballot" : " restaurants on the ballot");
}

/** Each empty view says what is actually missing, without pretending the directory is empty. */
const FILTER_EMPTY_COPY: Record<ContestFilter, string> = {
  all: "There are no contests to show.",
  open: "No contest is open for voting right now.",
  upcoming: "No contest is scheduled to open right now.",
  closed: "No contest has finished yet.",
  draft: "No contest is still a draft right now.",
};

function ContestMeta({ contest }: { contest: PublicContestSummary }) {
  const window = contestWindowLabel(contest);
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
      <ContestStatusBadge state={contestState(contest)} />
      {window ? (
        <span className="inline-flex items-center gap-1.5 text-sm text-muted-foreground">
          <CalendarDays aria-hidden className="size-4" />
          {window}
        </span>
      ) : null}
      <span className="text-sm text-muted-foreground">{nomineeLabel(contest.nominees)}</span>
    </div>
  );
}

/**
 * One public contest is not a one-item grid: it gets an editorial card with a 4:3 cover and a
 * calm body beside it. Zero, one and many keep their own layout from the same canonical read.
 */
function FeaturedContest({ contest }: { contest: PublicContestSummary }) {
  return (
    <article
      className="group overflow-hidden rounded-3xl border border-border/70 bg-card shadow-[0_10px_34px_-24px_oklch(0.4_0.05_180)] transition-colors hover:border-primary/40 focus-within:border-primary/40"
      data-featured="true"
      data-testid={"contest-card-" + contest.slug}
    >
      <Link
        className="flex flex-col focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-inset md:flex-row"
        href={"/contests/" + contest.slug}
      >
        <div
          className="aspect-[4/3] w-full md:aspect-auto md:w-[46%] md:shrink-0"
          data-testid="contest-featured-media"
        >
          <ContestCover
            className="h-full w-full"
            coverUrl={contest.coverUrl}
            sizes="(max-width: 768px) 100vw, 46vw"
            title={contest.title}
          />
        </div>

        <div
          className="flex w-full flex-col justify-between gap-6 p-6 sm:p-8 md:w-[54%] lg:p-10"
          data-testid="contest-featured-copy"
        >
          <div>
            <ContestMeta contest={contest} />
            <h3
              className="mt-4 text-balance font-serif text-2xl font-semibold leading-tight tracking-tight sm:text-3xl lg:text-4xl"
              data-testid="contest-name"
            >
              {contest.title}
            </h3>
            <p className="mt-3 line-clamp-4 max-w-prose text-pretty text-[15px] leading-relaxed text-foreground sm:text-base">
              {contest.description ??
                "The organizer has not published a description for this contest yet."}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-4">
            <span className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-primary px-5 text-sm font-semibold text-primary-foreground transition-colors group-hover:bg-primary/90">
              View contest
              <ArrowUpRight aria-hidden className="size-4" />
            </span>
            <span className="text-sm text-muted-foreground">
              One ballot per account, per contest.
            </span>
          </div>
        </div>
      </Link>
    </article>
  );
}

function ContestCard({ contest }: { contest: PublicContestSummary }) {
  return (
    <li
      className="group flex h-full flex-col overflow-hidden rounded-2xl border border-border/70 bg-card transition-colors hover:border-primary/40 hover:shadow-sm focus-within:border-primary/40"
      data-testid={"contest-card-" + contest.slug}
    >
      <Link
        className="flex h-full flex-col focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-inset"
        href={"/contests/" + contest.slug}
      >
        <ContestCover
          className="aspect-[4/3] w-full"
          coverUrl={contest.coverUrl}
          sizes="(max-width: 768px) 100vw, 50vw"
          title={contest.title}
        />
        <div className="flex flex-1 flex-col gap-3 p-5">
          <ContestMeta contest={contest} />
          <h3
            className="text-balance font-serif text-xl font-semibold leading-tight tracking-tight"
            data-testid="contest-name"
          >
            {contest.title}
          </h3>
          <p className="line-clamp-3 text-sm leading-relaxed text-muted-foreground">
            {contest.description ??
              "The organizer has not published a description for this contest yet."}
          </p>
          <span className="mt-auto inline-flex items-center gap-1.5 pt-2 text-sm font-medium text-primary group-hover:underline">
            View contest
            <ArrowUpRight aria-hidden className="size-4" />
          </span>
        </div>
      </Link>
    </li>
  );
}

function ErrorState() {
  return (
    <div
      className="rounded-3xl border border-dashed border-border bg-card px-6 py-10 text-center sm:px-10"
      data-testid="contests-error"
      role="status"
    >
      <span className="mx-auto flex size-11 items-center justify-center rounded-full bg-muted">
        <RotateCw aria-hidden className="size-5 text-muted-foreground" />
      </span>
      <h3 className="mt-4 text-lg font-semibold tracking-tight">We couldn&apos;t load the contests</h3>
      <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-muted-foreground">
        This is a temporary problem, not an empty list. Nothing has been deleted — retry in a
        moment.
      </p>
      <Link
        className="mt-5 inline-flex min-h-11 items-center justify-center rounded-xl border border-border bg-background px-5 text-sm font-semibold hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
        data-testid="contests-retry"
        href="/contests"
      >
        Try again
      </Link>
    </div>
  );
}

function EmptyDirectory() {
  return (
    <div
      className="rounded-3xl border border-dashed border-border bg-card px-6 py-12 text-center sm:px-10"
      data-testid="contests-empty"
      role="status"
    >
      <span className="mx-auto flex size-11 items-center justify-center rounded-full bg-primary/10">
        <UtensilsCrossed aria-hidden className="size-5 text-primary" />
      </span>
      <h3 className="mt-4 text-lg font-semibold tracking-tight">No restaurant contests yet</h3>
      <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-muted-foreground">
        Contests appear here as soon as an organizer publishes one. You can still explore the
        restaurants that take part.
      </p>
      <Link
        className="mt-5 inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-primary px-5 text-sm font-semibold text-primary-foreground hover:bg-primary/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
        href="/restaurants"
      >
        Browse restaurants
        <ArrowUpRight aria-hidden className="size-4" />
      </Link>
    </div>
  );
}

function EmptyFilter({ filter }: { filter: ContestFilter }) {
  return (
    <div
      className="rounded-3xl border border-dashed border-border bg-card px-6 py-10 text-center sm:px-10"
      data-testid="contests-filter-empty"
      role="status"
    >
      <span className="mx-auto flex size-11 items-center justify-center rounded-full bg-muted">
        <SearchX aria-hidden className="size-5 text-muted-foreground" />
      </span>
      <h3 className="mt-4 text-lg font-semibold tracking-tight">Nothing in this view</h3>
      <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-muted-foreground">
        {FILTER_EMPTY_COPY[filter]}
      </p>
      <Link
        className="mt-5 inline-flex min-h-11 items-center justify-center rounded-xl border border-border bg-background px-5 text-sm font-semibold hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
        href="/contests"
      >
        Show all contests
      </Link>
    </div>
  );
}

export function DirectorySkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading contests" data-testid="contests-loading">
      <div className="overflow-hidden rounded-3xl border border-border/70 bg-card md:flex">
        <Skeleton className="aspect-[4/3] w-full rounded-none motion-reduce:animate-none md:aspect-auto md:w-[46%]" />
        <div className="flex w-full flex-col gap-4 p-6 sm:p-8 md:w-[54%] lg:p-10">
          <Skeleton className="h-6 w-48 rounded-full motion-reduce:animate-none" />
          <Skeleton className="h-9 w-3/4 motion-reduce:animate-none" />
          <Skeleton className="h-4 w-full motion-reduce:animate-none" />
          <Skeleton className="h-4 w-5/6 motion-reduce:animate-none" />
          <Skeleton className="mt-4 h-11 w-36 rounded-xl motion-reduce:animate-none" />
        </div>
      </div>
    </div>
  );
}

/**
 * The data half of the directory, streamed behind a skeleton so a slow read never leaves the
 * page blank. This is a Suspense boundary *inside* the page on purpose: a segment-level
 * `loading.tsx` would flush a 200 shell before `[id]` could answer 404 for an unknown contest.
 */
export async function DirectoryResults({ filter }: { filter: ContestFilter }) {
  const result = await listPublicContests();
  const contests = result.status === "ok" ? result.contests : [];
  const visible = contests.filter((contest) => matchesFilter(contestState(contest), filter));
  const hasContests = contests.length > 0;

  return (
    <>
      <div className="mt-6">
        {result.status === "error" ? (
          <ErrorState />
        ) : !hasContests ? (
          <EmptyDirectory />
        ) : visible.length === 0 ? (
          <EmptyFilter filter={filter} />
        ) : visible.length === 1 ? (
          <FeaturedContest contest={visible[0]} />
        ) : (
          <ul className="grid grid-cols-1 gap-5 md:grid-cols-2" data-testid="contests-list">
            {visible.map((contest) => (
              <ContestCard contest={contest} key={contest.id} />
            ))}
          </ul>
        )}
      </div>

      {filter !== "all" && visible.length > 0 ? (
        <p className="mt-5 text-sm text-muted-foreground">
          Showing {CONTEST_FILTERS.find((entry) => entry.value === filter)?.label.toLowerCase()} ·{" "}
          <Link className="font-medium text-foreground underline underline-offset-4" href="/contests">
            show all contests
          </Link>
        </p>
      ) : null}
    </>
  );
}

export async function ContestDirectory({ status }: { status?: string | string[] }) {
  const filter = normalizeFilter(status);

  return (
    <main
      className="min-h-screen bg-background text-foreground"
      data-testid="contests-page"
      id="main-content"
      tabIndex={-1}
    >
      <div className="mx-auto w-full max-w-[1240px] px-4 sm:px-6 lg:px-8">
        <section
          aria-labelledby="contests-hero-title"
          className="grid items-center gap-8 pb-12 pt-8 sm:pt-12 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)] lg:gap-12 lg:pb-20 lg:pt-16"
        >
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">
              Medellín · Restaurant contests
            </p>
            <h1
              className="mt-4 max-w-[18ch] text-balance font-serif text-[2.125rem] font-semibold leading-[1.08] tracking-[-0.03em] sm:text-[2.75rem] lg:text-[3.25rem]"
              id="contests-hero-title"
            >
              A new way to celebrate Medellín&apos;s food.
            </h1>
            <p className="mt-5 max-w-[46ch] text-pretty text-base leading-relaxed text-muted-foreground sm:text-[17px]">
              Discover the contests, meet the restaurants on each ballot, and spend the one vote
              your account gets per contest.
            </p>
            <div className="mt-7 flex flex-wrap items-center gap-x-5 gap-y-3">
              <a
                className="inline-flex min-h-11 items-center justify-center rounded-xl bg-primary px-5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                href="#contests"
              >
                Explore contests
              </a>
              <Link
                className="inline-flex min-h-11 items-center gap-1.5 text-sm font-semibold text-foreground underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                href="/restaurants"
              >
                Browse restaurants
                <ArrowUpRight aria-hidden className="size-4" />
              </Link>
            </div>
            <p className="mt-4 text-xs leading-relaxed text-muted-foreground">
              One ballot per account, per contest. Nothing is saved until you confirm it.
            </p>
          </div>

          <ContestEditorialArt className="aspect-[4/3] w-full sm:aspect-[1.8] lg:aspect-[1.35]" />
        </section>

        <section
          aria-labelledby="contests-directory-heading"
          className="border-t border-border/70 pb-16 pt-10 sm:pt-12 lg:pt-16"
          id="contests"
        >
          <div className="flex flex-col gap-2">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">
              01 · Discover
            </p>
            <h2
              className="text-balance font-serif text-2xl font-semibold tracking-tight sm:text-3xl"
              id="contests-directory-heading"
            >
              Restaurant contests
            </h2>
            <p className="max-w-2xl text-pretty text-sm leading-relaxed text-muted-foreground sm:text-base">
              Contests, dates and ballots exactly as the organizers published them — drafts
              included, and labelled as drafts.
            </p>
          </div>

          <div
            aria-label="Filter contests by status"
            className="-mx-4 mt-6 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:px-0"
            data-testid="contest-filters"
            role="group"
          >
            {CONTEST_FILTERS.map((entry) => {
              const active = entry.value === filter;
              return (
                <Link
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "inline-flex min-h-10 shrink-0 items-center rounded-full border px-4 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary",
                    active
                      ? "border-primary/40 bg-primary/10 text-primary"
                      : "border-border bg-card text-foreground hover:bg-muted",
                  )}
                  href={filterHref(entry.value)}
                  key={entry.value}
                >
                  {entry.label}
                </Link>
              );
            })}
          </div>

          <Suspense fallback={<DirectorySkeleton />}>
            <DirectoryResults filter={filter} />
          </Suspense>
        </section>

        <footer className="border-t border-border/70 py-8 text-sm text-muted-foreground">
          <Link
            className="font-medium text-foreground underline underline-offset-4 hover:text-primary"
            href="/restaurants"
          >
            Browse all restaurants
          </Link>
        </footer>
      </div>
    </main>
  );
}
