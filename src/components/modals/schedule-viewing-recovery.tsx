"use client";

import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * SAN-1059 — the way forward when an apartment cannot take a viewing request.
 *
 * Kept out of {@link ScheduleViewingModal} so the modal keeps one job (the form) and this keeps
 * one job (the recovery). Nothing here changes the selected apartment: the renter either
 * re-checks this one or leaves for the results themselves.
 */
export const ScheduleViewingRecovery = ({
  submitting,
  resultsHref,
  onRecheck,
  onChooseAnother,
}: {
  submitting: boolean;
  resultsHref: string;
  onRecheck: () => void;
  onChooseAnother: () => void;
}) => {
  return (
    <div
      className="flex flex-col gap-2 rounded-lg border p-3"
      data-testid="schedule-viewing-recovery"
    >
      <p className="text-sm text-muted-foreground">
        Your details are still here. Re-check this apartment, or choose another one.
      </p>
      <div className="flex flex-col gap-2 sm:flex-row">
        <Button
          type="button"
          variant="outline"
          className="min-h-11 lg:min-h-0"
          data-testid="schedule-viewing-refresh"
          onClick={onRecheck}
          disabled={submitting}
        >
          {submitting ? "Checking…" : "Refresh apartment"}
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
