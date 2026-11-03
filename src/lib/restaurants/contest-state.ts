/**
 * SAN-1524 · contest presentation rules, free of any database or server import so they can be
 * unit tested and reused on either side of the boundary.
 *
 * A stored status is not what a visitor experiences: "live" with a past end date is closed, and a
 * "draft" is never open regardless of its dates.
 */

export type ContestStatus = "draft" | "live" | "closed" | "archived";

export type ContestState = "open" | "upcoming" | "closed" | "draft" | "archived";

export type PublicContest = {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  status: ContestStatus;
  startsAt: string | null;
  endsAt: string | null;
  coverUrl: string | null;
};

export function contestState(contest: PublicContest, now: Date = new Date()): ContestState {
  if (contest.status === "archived") return "archived";
  if (contest.status === "draft") return "draft";
  if (contest.status === "closed") return "closed";
  const ends = contest.endsAt ? new Date(contest.endsAt) : null;
  if (ends && !Number.isNaN(ends.getTime()) && ends.getTime() <= now.getTime()) return "closed";
  const starts = contest.startsAt ? new Date(contest.startsAt) : null;
  if (starts && !Number.isNaN(starts.getTime()) && starts.getTime() > now.getTime()) return "upcoming";
  return "open";
}

const BOGOTA_DATE = new Intl.DateTimeFormat("en-CA", {
  dateStyle: "medium",
  timeZone: "America/Bogota",
});

/** Contests are administered in Medellín; never render a date in the server's own timezone. */
export function contestDate(iso: string | null): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return BOGOTA_DATE.format(date);
}

export function contestWindowLabel(contest: PublicContest): string | null {
  const start = contestDate(contest.startsAt);
  const end = contestDate(contest.endsAt);
  if (!start && !end) return null;
  if (start && end) return start + " – " + end;
  return start ? "From " + start : "Until " + end;
}

export function canVoteIn(state: ContestState): boolean {
  return state === "open";
}
