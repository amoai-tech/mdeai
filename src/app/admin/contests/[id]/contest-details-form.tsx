import type { AdminContestDetail } from "@/lib/restaurants/contest-admin";
import { updateContestAction } from "../actions";
import { ContestDateFields } from "./contest-date-fields";

const STATUSES = ["draft", "live", "closed", "archived"] as const;

/** SAN-1526 · contest fields, status and dates. */
export function ContestDetailsForm({ contest }: { contest: AdminContestDetail["contest"] }) {
  return (
    <section className="mb-8 rounded-lg border border-border/60 p-4">
      <h2 className="mb-3 text-sm font-semibold">Contest details</h2>
      <form action={updateContestAction} className="grid gap-3 sm:grid-cols-2">
        <input type="hidden" name="contest_id" value={contest.id} />
        <label className="text-sm sm:col-span-2">
          <span className="mb-1 block text-muted-foreground">Title</span>
          <input
            className="min-h-11 w-full rounded-md border border-border/60 bg-background px-3"
            name="title"
            defaultValue={contest.title}
            maxLength={120}
          />
        </label>
        <label className="text-sm sm:col-span-2">
          <span className="mb-1 block text-muted-foreground">Description</span>
          <textarea
            className="min-h-20 w-full rounded-md border border-border/60 bg-background px-3 py-2"
            name="description"
            defaultValue={contest.description ?? ""}
            maxLength={400}
          />
        </label>
        <label className="text-sm">
          <span className="mb-1 block text-muted-foreground">Status</span>
          <select
            className="min-h-11 w-full rounded-md border border-border/60 bg-background px-3"
            name="status"
            defaultValue={contest.status}
          >
            {STATUSES.map((status) => (
              <option key={status} value={status}>
                {status}
              </option>
            ))}
          </select>
        </label>
        <ContestDateFields startsAt={contest.starts_at} endsAt={contest.ends_at} />
        <div className="sm:col-span-2">
          <button
            className="min-h-11 rounded-md bg-primary px-4 font-medium text-primary-foreground"
            data-testid="contest-update-submit"
            type="submit"
          >
            Save changes
          </button>
        </div>
      </form>
    </section>
  );
}