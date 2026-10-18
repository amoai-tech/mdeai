import type { AdminContestAudit } from "@/lib/restaurants/contest-admin";

/** SAN-1526 · the audit trail for this contest. */
export function ContestActivity({ audit }: { audit: AdminContestAudit[] }) {
  return (
    <section>
      <h2 className="mb-3 text-sm font-semibold">Activity</h2>
      {audit.length === 0 ? (
        <p className="text-sm text-muted-foreground">No changes recorded yet.</p>
      ) : (
        <ul className="space-y-2 text-sm">
          {audit.map((row, index) => (
            <li key={index} className="rounded-md border border-border/60 p-3">
              <span className="font-medium">{row.action}</span>{" "}
              <span className="text-muted-foreground">
                · {row.origin} · {new Date(row.created_at).toLocaleString()}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}