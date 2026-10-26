"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  setAdminEventState,
  type AdminEventAction,
  type AdminEventActionResult,
} from "@/app/app/admin/events/actions";

export type AdminEventRow = {
  id: string;
  name: string;
  status: string;
  isActive: boolean;
  startsAt: string;
  organizerId: string | null;
  slug: string | null;
};

function when(iso: string) {
  if (!iso) return "—";
  try {
    return new Intl.DateTimeFormat("en-US", {
      timeZone: "America/Bogota",
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

/**
 * SAN-515 — admin event table. Every button is a server-authorized action; the
 * client only reports what the server returned and never assumes success.
 */
export function AdminEventsTable({ rows }: { rows: AdminEventRow[] }) {
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [results, setResults] = useState<Record<string, AdminEventActionResult>>({});
  const [, startTransition] = useTransition();

  function run(eventId: string, action: AdminEventAction) {
    setPendingId(eventId);
    startTransition(async () => {
      try {
        const outcome = await setAdminEventState(eventId, action);
        setResults((current) => ({ ...current, [eventId]: outcome }));
      } catch {
        setResults((current) => ({
          ...current,
          [eventId]: {
            ok: false,
            code: "FAILED",
            message: "Could not save this change. Try again.",
          },
        }));
      } finally {
        setPendingId(null);
      }
    });
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[900px] border-collapse text-sm" data-testid="admin-events-table">
        <thead>
          <tr className="border-b border-border text-left text-xs uppercase text-muted-foreground">
            <th className="py-2 pr-3">Event</th>
            <th className="py-2 pr-3">Starts (Bogotá)</th>
            <th className="py-2 pr-3">Status</th>
            <th className="py-2 pr-3">Active</th>
            <th className="py-2">Actions</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const result = results[row.id];
            const isPublished = row.status === "published" || row.status === "live";
            return (
              <tr key={row.id} className="border-b border-border/60 align-top">
                <td className="py-2 pr-3">
                  <Link
                    href={`/app/events/${row.id}`}
                    className="font-medium hover:underline"
                    data-testid="admin-event-link"
                  >
                    {row.name}
                  </Link>
                  <p className="font-mono text-xs text-muted-foreground">{row.id}</p>
                </td>
                <td className="py-2 pr-3 text-xs">{when(row.startsAt)}</td>
                <td className="py-2 pr-3">
                  <Badge variant={isPublished ? "default" : "outline"} data-testid="admin-event-status">
                    {row.status}
                  </Badge>
                </td>
                <td className="py-2 pr-3 text-xs">{row.isActive ? "yes" : "no"}</td>
                <td className="py-2">
                  <div className="flex flex-wrap gap-2">
                    {isPublished ? (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={pendingId !== null}
                        onClick={() => run(row.id, "unpublish")}
                        data-testid="admin-event-unpublish"
                      >
                        Unpublish
                      </Button>
                    ) : (
                      <Button
                        type="button"
                        size="sm"
                        disabled={pendingId !== null}
                        onClick={() => run(row.id, "publish")}
                        data-testid="admin-event-publish"
                      >
                        Publish
                      </Button>
                    )}
                    {!row.isActive ? (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={pendingId !== null}
                        onClick={() => run(row.id, "restore")}
                        data-testid="admin-event-restore"
                      >
                        Restore
                      </Button>
                    ) : null}
                  </div>
                  <div aria-live="polite" className="mt-1 text-xs">
                    {result?.ok ? (
                      <span className="text-emerald-700">Saved: {result.status}</span>
                    ) : result && !result.ok ? (
                      <span className="text-destructive">{result.message}</span>
                    ) : null}
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
