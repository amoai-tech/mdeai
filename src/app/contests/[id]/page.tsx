import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { cache } from "react";
import { EmptyState } from "@/components/empty/empty-state";
import { ContestNomineeCard } from "@/components/restaurants/contest-nominee-card";
import { isRenderableRemoteImage } from "@/lib/images/remote-image-hosts";
import {
  contestState,
  contestWindowLabel,
  getPublicContest,
  type ContestState,
} from "@/lib/restaurants/contest-public";

export const dynamic = "force-dynamic";

// generateMetadata and the page body both need this read; React de-duplicates it per request.
const loadContest = cache(getPublicContest);

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

function describe(description: string | null): string {
  if (!description) return "See the Medellín restaurants competing in this contest and where to vote.";
  const text = description.replace(/\s+/g, " ").trim();
  return text.length > 155 ? text.slice(0, 152).trimEnd() + "…" : text;
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
  const acceptedTotal = nominees.reduce((sum, nominee) => sum + nominee.audienceAccepted, 0);
  const testTotal = nominees.reduce((sum, nominee) => sum + nominee.developmentTestTotal, 0);
  const state = contestState(contest);
  const window = contestWindowLabel(contest);
  const cover = contest.coverUrl;

  return (
    <main className="mx-auto min-h-screen max-w-4xl px-4 py-10 sm:px-6" data-testid="contest-page" data-contest-id={contest.id}>
      <nav className="mb-4 text-sm">
        <Link className="text-muted-foreground underline" href="/contests">All contests</Link>
      </nav>

      {cover && isRenderableRemoteImage(cover) ? (
        <Image
          alt=""
          aria-hidden
          className="mb-6 h-48 w-full rounded-2xl object-cover sm:h-64"
          height={512}
          src={cover}
          width={1024}
        />
      ) : null}

      <header className="mb-8">
        <h1
          className="text-balance font-serif text-4xl font-semibold tracking-tight sm:text-5xl"
          data-testid="contest-title"
        >
          {contest.title}
        </h1>
        <p className="mt-3 flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
          <span
            className="inline-flex items-center gap-1.5 rounded-full border border-border/60 px-2.5 py-1 text-xs font-medium text-muted-foreground"
            data-testid="contest-state"
          >
            <span aria-hidden className={"size-1.5 rounded-full " + STATE_DOT[state]} />
            {STATE_LABEL[state]}
          </span>
          {window ? <span>{window}</span> : null}
        </p>
      </header>

      <section aria-labelledby="contest-about" className="mb-10">
        <h2 className="mb-2 text-lg font-semibold tracking-tight" id="contest-about">About this contest</h2>
        {contest.description ? (
          <p className="text-pretty text-base leading-relaxed text-foreground" data-testid="contest-description">{contest.description}</p>
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
        <h2 className="mb-3 text-lg font-semibold tracking-tight" id="contest-nominees">
          Restaurants on the ballot
        </h2>

        <div className="mb-5 rounded-2xl border border-border/60 bg-muted/20 p-4 sm:p-5" data-testid="contest-standings">
          <p className="text-xs font-medium uppercase tracking-[0.14em] text-primary">Standings</p>
          <p className="mt-2 text-sm text-foreground" data-testid="standings-summary">
            <span className="font-semibold">{acceptedTotal}</span> accepted audience vote
            {acceptedTotal === 1 ? "" : "s"}
            <span className="mx-2 text-muted-foreground">·</span>
            <span className="font-semibold">{testTotal}</span> development test vote
            {testTotal === 1 ? "" : "s"}
          </p>
          <p className="mt-1 text-sm text-muted-foreground" data-testid="standings-state">
            {acceptedTotal === 0
              ? "No accepted votes yet — there is no leader or winner."
              : "Current leaders, not a certified winner. Test votes are shown separately and never counted."}
          </p>
        </div>
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
