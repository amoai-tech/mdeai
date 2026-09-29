import { describe, expect, it } from "vitest";
import {
  buildViewingRequests,
  type BrokerLeadRow,
  type BrokerShowingRow,
} from "../build-broker-dashboard-view";

// skipcq: JS-0067 - vitest fixture helpers
function showing(overrides: Partial<BrokerShowingRow> = {}): BrokerShowingRow {
  return {
    id: "show-1",
    apartment_id: "apt-1",
    scheduled_at: "2030-01-01T14:00:00.000Z",
    status: "scheduled",
    lead_id: "lead-1",
    created_at: "2030-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function lead(overrides: Partial<BrokerLeadRow> = {}): BrokerLeadRow {
  return {
    id: "lead-1",
    name: "Sofia",
    email: "sofia@example.com",
    status: "new",
    created_at: "2030-01-01T00:00:00.000Z",
    last_contacted_at: null,
    apartment_id: "apt-1",
    ...overrides,
  };
}

const LISTINGS = [{ id: "apt-1", title: "Laureles 2BR" }];

describe("buildViewingRequests", () => {
  it("turns one showing into exactly one visible request, with the real apartment and renter", () => {
    const requests = buildViewingRequests({
      showings: [showing()],
      leads: [lead()],
      listings: LISTINGS,
    });

    expect(requests).toHaveLength(1);
    expect(requests[0]).toMatchObject({
      leadId: "lead-1",
      showingId: "show-1",
      apartmentId: "apt-1",
      apartmentTitle: "Laureles 2BR",
      renterName: "Sofia",
      status: "scheduled",
    });
    expect(requests[0]?.scheduledLabel).toBeTruthy();
  });

  it("never shows the same request twice, even if the same showing is returned twice", () => {
    const requests = buildViewingRequests({
      showings: [showing(), showing()],
      leads: [lead()],
      listings: LISTINGS,
    });

    expect(requests).toHaveLength(1);
    expect(requests.map((r) => r.showingId)).toEqual(["show-1"]);
  });

  it("keeps two genuinely different requests as two separate cards", () => {
    const requests = buildViewingRequests({
      showings: [
        showing({ id: "show-1", lead_id: "lead-1" }),
        showing({ id: "show-2", lead_id: "lead-2", scheduled_at: "2030-02-01T14:00:00.000Z" }),
      ],
      leads: [lead(), lead({ id: "lead-2", name: "Andrés" })],
      listings: LISTINGS,
    });

    expect(requests).toHaveLength(2);
    expect(requests.map((r) => r.renterName).sort()).toEqual(["Andrés", "Sofia"]);
  });

  it("falls back to the lead email, then to null, so a nameless request still renders", () => {
    const byEmail = buildViewingRequests({
      showings: [showing()],
      leads: [lead({ name: "   ", email: "sofia@example.com" })],
      listings: LISTINGS,
    });
    expect(byEmail[0]?.renterName).toBe("sofia@example.com");

    const byNothing = buildViewingRequests({
      showings: [showing()],
      leads: [lead({ name: null, email: null })],
      listings: LISTINGS,
    });
    expect(byNothing[0]?.renterName).toBeNull();
  });

  it("does not invent an apartment title when the listing is unknown", () => {
    const requests = buildViewingRequests({
      showings: [showing({ apartment_id: "apt-unknown" })],
      leads: [lead()],
      listings: LISTINGS,
    });

    expect(requests[0]?.apartmentTitle).toBeNull();
  });

  it("orders by when the request arrived, not by appointment date", () => {
    // The defect this pins: the query ordered by created_at while the builder re-sorted by
    // scheduled_at, silently restoring "farthest-future first". The two keys must agree.
    const requests = buildViewingRequests({
      showings: [
        // Arrived first, but booked far in the future.
        showing({
          id: "arrived-first",
          created_at: "2030-01-01T00:00:00.000Z",
          scheduled_at: "2099-01-01T14:00:00.000Z",
        }),
        // Arrived later, but booked sooner.
        showing({
          id: "arrived-later",
          created_at: "2030-06-01T00:00:00.000Z",
          scheduled_at: "2030-06-02T14:00:00.000Z",
        }),
      ],
      leads: [lead()],
      listings: LISTINGS,
    });

    // Newest arrival wins even though its appointment is much later.
    expect(requests.map((r) => r.showingId)).toEqual(["arrived-later", "arrived-first"]);
    expect(requests[0]?.createdAt).toBe("2030-06-01T00:00:00.000Z");

    expect(buildViewingRequests({ showings: [], leads: [], listings: [] })).toEqual([]);
  });

  it("labels the viewing in the listing timezone, not the server's timezone", () => {
    // 19:00Z is 2:00 PM in America/Bogota. Vercel runs the server in UTC, where an unqualified
    // toLocaleString rendered this to the broker as 7:00 PM — five hours wrong.
    const instant = "2099-11-20T19:00:00.000Z";
    const requests = buildViewingRequests({
      showings: [showing({ scheduled_at: instant })],
      leads: [lead()],
      listings: LISTINGS,
    });
    const label = requests[0]?.scheduledLabel ?? "";

    expect(label).toMatch(/2:00\s*PM/);
    expect(label).not.toMatch(/7:00\s*PM/);
    expect(label).toBe(
      new Date(instant).toLocaleString("en-US", {
        weekday: "short",
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
        timeZone: "America/Bogota",
      }),
    );
  });
});
