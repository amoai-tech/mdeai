"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  BROKER_VIEWING_ACTION_LABELS,
  availableBrokerViewingActions,
  type BrokerViewingAction,
} from "@/lib/rentals/broker-viewing-action";

/**
 * A stale page is not something the broker can repair by clicking again, so the copy says what
 * to actually do rather than restating the conflict.
 */
const STALE_ACTION_MESSAGE = "This request changed. Refresh and try again.";

type BrokerViewingRequestActionsProps = {
  showingId: string;
  /** The persisted status. The available actions are derived from it, never from a local guess. */
  status: string;
  /** The persisted instant the caller believed it was acting on, echoed back as the expectation. */
  scheduledAt: string;
};

/**
 * SAN-1206 · the operator controls on one existing viewing-request card.
 *
 * Three deliberate properties:
 *
 *   1. No local status. A success calls `router.refresh()` and re-reads the Server Component,
 *      so the card can never display a status the database did not commit.
 *   2. The expectation (`status` + `scheduledAt`) is sent with every action. If the request
 *      moved while this page was open, the database answers 409 and this card says so instead
 *      of overwriting the newer outcome.
 *   3. `datetime-local` is sent raw. The wall clock is resolved to a Medellín instant on the
 *      server, so the browser's own timezone cannot change what the broker meant.
 */
export function BrokerViewingRequestActions({
  showingId,
  status,
  scheduledAt,
}: BrokerViewingRequestActionsProps) {
  const router = useRouter();
  const [pending, setPending] = useState<BrokerViewingAction | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [rescheduleOpen, setRescheduleOpen] = useState(false);
  const [wallClock, setWallClock] = useState("");

  const actions = availableBrokerViewingActions(status);
  if (actions.length === 0) {
    return null;
  }

  const busy = pending !== null;

  async function submit(action: BrokerViewingAction, newWallClock?: string) {
    setPending(action);
    setError(null);

    try {
      const response = await fetch(`/api/host/rentals/viewings/${showingId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action,
          expectedStatus: status,
          expectedScheduledAt: scheduledAt,
          ...(newWallClock ? { newWallClock } : {}),
        }),
      });

      if (response.status === 409) {
        setError(STALE_ACTION_MESSAGE);
        return;
      }

      const body = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) {
        setError(body.error ?? "Couldn't update this request.");
        return;
      }

      setRescheduleOpen(false);
      setWallClock("");
      router.refresh();
    } catch {
      setError("Couldn't reach the server. Try again.");
    } finally {
      setPending(null);
    }
  }

  return (
    <div className="mt-2 space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        {actions.includes("confirm") ? (
          <Button
            type="button"
            size="sm"
            disabled={busy}
            data-testid={`viewing-request-confirm-${showingId}`}
            onClick={() => void submit("confirm")}
          >
            {pending === "confirm" ? "Confirming…" : BROKER_VIEWING_ACTION_LABELS.confirm}
          </Button>
        ) : null}

        {actions.includes("cancel") ? (
          <Button
            type="button"
            size="sm"
            variant="destructive"
            disabled={busy}
            data-testid={`viewing-request-decline-${showingId}`}
            onClick={() => void submit("cancel")}
          >
            {pending === "cancel" ? "Declining…" : BROKER_VIEWING_ACTION_LABELS.cancel}
          </Button>
        ) : null}

        {actions.includes("reschedule") ? (
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={busy}
            aria-expanded={rescheduleOpen}
            data-testid={`viewing-request-reschedule-${showingId}`}
            onClick={() => {
              setError(null);
              setRescheduleOpen((open) => !open);
            }}
          >
            {BROKER_VIEWING_ACTION_LABELS.reschedule}
          </Button>
        ) : null}
      </div>

      {rescheduleOpen && actions.includes("reschedule") ? (
        <div className="flex flex-wrap items-center gap-2">
          <Input
            type="datetime-local"
            aria-label="New viewing time"
            className="w-full sm:w-auto"
            disabled={busy}
            value={wallClock}
            data-testid={`viewing-request-reschedule-input-${showingId}`}
            onChange={(event) => setWallClock(event.target.value)}
          />
          <Button
            type="button"
            size="sm"
            disabled={busy || wallClock.length === 0}
            data-testid={`viewing-request-reschedule-submit-${showingId}`}
            onClick={() => void submit("reschedule", wallClock)}
          >
            {pending === "reschedule" ? "Moving…" : "Move viewing"}
          </Button>
        </div>
      ) : null}

      {error ? (
        <p
          role="alert"
          data-testid={`viewing-request-error-${showingId}`}
          className="text-xs text-destructive"
        >
          {error}
        </p>
      ) : null}
    </div>
  );
}
