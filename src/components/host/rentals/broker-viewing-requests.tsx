"use client";

import { CalendarClock } from "lucide-react";
import { EmptyState } from "@/components/empty/empty-state";
import { Badge } from "@/components/ui/badge";
import { BrokerViewingRequestActions } from "@/components/host/rentals/broker-viewing-request-actions";
import { brokerViewingStatusLabel } from "@/lib/rentals/broker-viewing-action";
import type { BrokerViewingRequest } from "@/lib/rentals/broker-dashboard-types";

type BrokerViewingRequestsProps = {
  requests: BrokerViewingRequest[];
  /** Total requests that exist. When larger than `requests`, the list is a page, not everything. */
  total?: number;
  loadError: string | null;
};

/**
 * SAN-1204 · the real viewing requests the signed-in broker owns.
 *
 * One card per persisted showing, so a single request can never appear twice. Every card
 * carries its exact lead/showing/apartment IDs so a test can correlate what the broker sees
 * with the row that actually exists.
 *
 * SAN-1206 adds the operator controls to each card. The label mapping lives in
 * `brokerViewingStatusLabel` rather than here, so the word the broker reads and the actions
 * offered are decided in one tested place.
 */
// skipcq: JS-0067 - ES module export; not browser global scope
export function BrokerViewingRequests({ requests, total, loadError }: BrokerViewingRequestsProps) {
  if (loadError) {
    return (
      <EmptyState
        testId="viewing-requests-error"
        title="Couldn't load viewing requests"
        description={loadError}
      />
    );
  }

  if (requests.length === 0) {
    return (
      <EmptyState
        testId="viewing-requests-empty"
        title="No viewing requests yet"
        description="When a renter asks to view one of your listings, the request shows up here."
      />
    );
  }

  const totalCount = Math.max(total ?? requests.length, requests.length);
  const hiddenCount = totalCount - requests.length;

  return (
    <div className="space-y-2">
      {hiddenCount > 0 ? (
        <p
          data-testid="viewing-requests-truncated"
          className="text-xs text-muted-foreground"
        >
          Showing the {requests.length} most recent of {totalCount} requests.
        </p>
      ) : null}
      <ul data-testid="viewing-requests" className="space-y-2">
        {requests.map((request) => (
          <li
          key={request.showingId}
          data-testid={`viewing-request-${request.showingId}`}
          data-lead-id={request.leadId}
          data-showing-id={request.showingId}
          data-apartment-id={request.apartmentId}
          data-status={request.status}
          className="rounded-lg border border-border bg-card p-3"
        >
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-foreground">
                {request.apartmentTitle ?? "Your listing"}
              </p>
              <p
                data-testid={`viewing-request-renter-${request.showingId}`}
                className="truncate text-xs text-muted-foreground"
              >
                {request.renterName ?? "Renter"}
              </p>
            </div>
            <Badge
              data-testid={`viewing-request-status-${request.showingId}`}
              variant="secondary"
              className="shrink-0 text-xs"
            >
              {brokerViewingStatusLabel(request.status)}
            </Badge>
          </div>
          <p className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground">
            <CalendarClock className="size-3.5" aria-hidden />
            <span data-testid={`viewing-request-time-${request.showingId}`}>
              {request.scheduledLabel}
            </span>
          </p>
          <BrokerViewingRequestActions
            showingId={request.showingId}
            status={request.status}
            scheduledAt={request.scheduledAt}
          />
        </li>
        ))}
      </ul>
    </div>
  );
}
