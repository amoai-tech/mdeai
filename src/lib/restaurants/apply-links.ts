/**
 * Bulk nominee linking: pure orchestration, no database access.
 *
 * The admin submits a list of restaurants. Each link is independent: one failure must never
 * abort the rest, and a partial run must be described truthfully so it can be retried safely.
 * Linking is idempotent per (contest, restaurant), so a retry returns `already_linked` for the
 * rows that did commit instead of creating duplicates.
 *
 * Kept free of `server-only` and of any Supabase import so the interesting behaviour is a plain
 * unit test with a fake linker — not a mocked server action.
 */

/** Upper bound for one submission; the whole catalog is ~43. */
export const MAX_BULK_LINK = 60;

export type LinkOutcome = { already_linked?: boolean };

export type LinkFailure = { id: string; reason: string };

export type ApplyLinksResult = {
  added: string[];
  already: string[];
  failed: LinkFailure[];
};

export type BulkSelectionCheck = { ok: true; ids: string[] } | { ok: false; error: string };

/** Reject an empty or oversized selection before any write is attempted. */
export function checkBulkSelection(ids: string[], limit: number = MAX_BULK_LINK): BulkSelectionCheck {
  if (ids.length === 0) return { ok: false, error: "Choose at least one restaurant." };
  if (ids.length > limit) {
    return { ok: false, error: "Add at most " + limit + " restaurants at a time." };
  }
  return { ok: true, ids };
}

/** A thrown value becomes a short, safe reason. Never surface a raw stack to the admin. */
export function describeLinkError(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === "string" && error) return error;
  return "Unexpected error";
}

/**
 * Link every id, isolating failures.
 *
 * Returns which ids were added, which were already linked, and which failed with a reason.
 * It never throws: the caller decides what to show, but it always learns the truth.
 */
export async function applyLinks(
  ids: string[],
  link: (id: string) => Promise<LinkOutcome>,
): Promise<ApplyLinksResult> {
  const result: ApplyLinksResult = { added: [], already: [], failed: [] };
  for (const id of ids) {
    try {
      const outcome = await link(id);
      if (outcome?.already_linked) result.already.push(id);
      else result.added.push(id);
    } catch (error) {
      result.failed.push({ id, reason: describeLinkError(error) });
    }
  }
  return result;
}