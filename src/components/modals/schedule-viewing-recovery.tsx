"use client";

import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * SAN-1059 — the way forward when an apartment cannot take a viewing request.
 *
 * Kept out of {@link ScheduleViewingModal} so the modal keeps one job (the form) and this keeps
 * one job (the recovery). Nothing here changes the selected apartment: the renter either retries
 * this one or leaves for the results themselves.
 *
 * The retry action is a WRITE, not a refresh: it re-sends the viewing request. It is safe to
 * press because the request is idempotent — the key is derived from the apartment, the renter's
 * details and the chosen time, so a retry either creates the one request or replays the same
 * lead and showing. It is labelled "Retry viewing request" so nobody expects a read-only check.
 */
export const ScheduleViewingRecovery = ({
  submitting,
  resultsHref,
  onRetry,
  onChooseAnother,
}: {
  submitting: boolean;
  resultsHref: string;
  onRetry: () => void;
  onChooseAnother: () => void;
}) => {
  return (
    <div
      className="flex flex-col gap-2 rounded-lg border p-3"
      data-testid="schedule-viewing-recovery"
    >
      <p className="text-sm text-muted-foreground">
        Your details are still here. Retry this viewing request, or choose another one.
      </p>
      <div className="flex flex-col gap-2 sm:flex-row">
        <Button
          type="button"
          variant="outline"
          className="min-h-11 lg:min-h-0"
          data-testid="schedule-viewing-retry"
          onClick={onRetry}
          disabled={submitting}
        >
          {submitting ? "Retrying…" : "Retry viewing request"}
        </Button>
        {/* A real link: no router context, nothing typed is lost, and the destination works
            without JavaScript. */}
        <a
          href={resultsHref}
          data-testid="schedule-viewing-choose-another"
          className={cn(buttonVariants(), "min-h-11 lg:min-h-0")}
          onClick={onChooseAnother}
        >
          Choose another apartment
        </a>
      </div>
    </div>
  );
};
