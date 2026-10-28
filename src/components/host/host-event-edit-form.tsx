"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { updateHostEventForm } from "@/app/app/events/[id]/actions";
import { formatBogotaInput, type EventUpdateResult } from "@/lib/events/update-event-core";
import type { HostEventDetail } from "@/lib/events/load-host-event";
import { HostEventFields } from "./host-event-fields";

type Props = { detail: HostEventDetail };

/**
 * SAN-885 — the manual edit form.
 *
 * It submits straight to the server action (`useActionState`), so a save works
 * without hydration and is always re-validated server-side. The revision it
 * loaded travels with the form; a stale revision returns CONFLICT and the UI
 * never pretends the save succeeded. No client-side price or time maths.
 */
export function HostEventEditForm({ detail }: Props) {
  const { event } = detail;
  const [state, formAction, pending] = useActionState<EventUpdateResult | null, FormData>(
    updateHostEventForm,
    null,
  );
  const revision = state?.ok ? state.updatedAt : event.updatedAt;

  return (
    <form action={formAction} className="space-y-4" data-testid="host-event-edit-form">
      <input type="hidden" name="eventId" value={event.id} />
      <input type="hidden" name="expectedUpdatedAt" value={revision} />

      <HostEventFields
        defaults={{
          name: event.name,
          description: event.description ?? "",
          startTime: formatBogotaInput(event.eventStartTime),
          endTime: formatBogotaInput(event.eventEndTime),
          address: event.address ?? "",
          city: event.city ?? "Medellín",
        }}
        fieldErrors={state && !state.ok ? state.fieldErrors ?? {} : {}}
      />

      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={pending} data-testid="host-event-save">
          {pending ? "Saving…" : "Save changes"}
        </Button>
        <span className="text-xs text-muted-foreground">
          Saving updates this event only; tickets keep their IDs and sales.
        </span>
      </div>

      <div aria-live="polite" data-testid="host-event-save-status">
        {state?.ok ? (
          <p className="rounded-md border border-border bg-muted px-3 py-2 text-sm">
            Saved. Refreshing keeps these values.
          </p>
        ) : null}
        {state && !state.ok ? (
          <div className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm">
            <p className="font-medium text-destructive">{state.message}</p>
            {state.code === "CONFLICT" ? (
              <a
                href={`/app/events/${event.id}`}
                className="mt-2 inline-flex min-h-9 items-center text-sm text-primary hover:underline"
              >
                Reload latest changes
              </a>
            ) : null}
          </div>
        ) : null}
      </div>
    </form>
  );
}
