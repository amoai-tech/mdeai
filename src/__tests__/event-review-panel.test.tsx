import { describe, expect, it } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { EventPublishApprovalPanel } from "@/components/host/event-publish-approval-panel";
import { EventDraftStateSchema } from "@/lib/types";

const draft = EventDraftStateSchema.parse({
  title: "Salsa Night",
  neighborhood: "Laureles",
  dateIso: "2026-11-01T20:00:00-05:00",
  venue: "Son Havana",
  capacity: 80,
  priceMinCop: 50000,
});

describe("EventPublishApprovalPanel", () => {
  it("renders the existing review controls without claiming a saved receipt", () => {
    const html = renderToStaticMarkup(
      <EventPublishApprovalPanel draft={draft} status="executing" respond={() => {}} />,
    );
    expect(html).toContain("Ready to publish?");
    expect(html).toContain("Publish event");
    expect(html).not.toContain("host-event-approval-receipt");
  });
});
