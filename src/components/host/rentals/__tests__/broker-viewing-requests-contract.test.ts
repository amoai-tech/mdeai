import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const COMPONENTS = join(import.meta.dirname, "..");
const BROKER_PAGE = join(
  import.meta.dirname,
  "..",
  "..",
  "..",
  "..",
  "app",
  "host",
  "rentals",
  "(broker)",
  "page.tsx",
);

// skipcq: JS-0067 - module-local test helper; not browser global scope
function read(path: string): string {
  return readFileSync(path, "utf8");
}

describe("SAN-1204 broker viewing-request surface contract", () => {
  it("renders each request from the persisted ids so a test can correlate it", () => {
    const surface = read(join(COMPONENTS, "broker-viewing-requests.tsx"));

    // The list itself carries the real testid.
    expect(surface).toContain('data-testid="viewing-requests"');
    // The empty and error states render through the shared EmptyState, which takes `testId`.
    expect(surface).toContain('testId="viewing-requests-empty"');
    expect(surface).toContain('testId="viewing-requests-error"');

    // The exact identifiers must reach the DOM, otherwise the browser proof cannot tie what
    // the broker sees back to the lead/showing rows that exist.
    expect(surface).toContain("data-lead-id={request.leadId}");
    expect(surface).toContain("data-showing-id={request.showingId}");
    expect(surface).toContain("data-apartment-id={request.apartmentId}");
    expect(surface).toContain("request.apartmentTitle");
    expect(surface).toContain("request.renterName");
    expect(surface).toContain("request.scheduledLabel");
    expect(surface).toContain("request.status");
  });

  it("renders the loaded dashboard instead of the Phase-A placeholders", () => {
    const workspace = read(join(COMPONENTS, "rentals-dynamic-workspace.tsx"));

    expect(workspace).toContain("BrokerViewingRequests");
    expect(workspace).toContain("dashboard?.viewingRequests");
    expect(workspace).toContain('data-testid="ctx-viewing-requests"');
    // Real KPIs come from the view model now.
    expect(workspace).toContain("dashboard?.kpis");
  });

  it("shows the requests in the default concierge landing mode too, not only overview", () => {
    const workspace = read(join(COMPONENTS, "rentals-dynamic-workspace.tsx"));

    // The default `/host/rentals` landing is concierge mode. The surface is built once and
    // must be rendered from BOTH branches, or the broker lands on an empty panel.
    expect(workspace.match(/const requestsSurface =/g) ?? []).toHaveLength(1);
    expect(workspace.match(/\{requestsSurface\}/g) ?? []).toHaveLength(2);
  });

  it("loads the broker's own data on the server, never in the browser", () => {
    expect(existsSync(BROKER_PAGE)).toBe(true);
    const page = read(BROKER_PAGE);

    expect(page).toContain("getBrokerContext");
    expect(page).toContain("fetchBrokerDashboard");
    expect(page).toContain("ctx.user.id");
    expect(page).toContain("createClient");
    // A failure must surface as an error state, not as a fake-empty list.
    expect(page).toContain("loadError");
  });
});
