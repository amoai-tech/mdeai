import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const COMPONENTS = join(import.meta.dirname, "..");
const ROUTE = join(
  import.meta.dirname,
  "..",
  "..",
  "..",
  "..",
  "app",
  "api",
  "host",
  "rentals",
  "viewings",
  "[id]",
  "route.ts",
);

// skipcq: JS-0067 - module-local test helper; not browser global scope
function read(path: string): string {
  return readFileSync(path, "utf8");
}

/**
 * These are source-contract assertions, matching the SAN-1204 convention in this directory.
 * There is no component-rendering library in this repository and this task adds no dependency,
 * so the browser journey covers the rendered result while these pin the properties that would
 * silently regress without one.
 *
 * Every assertion below is chosen to fail on a specific real regression, not to restate a line.
 */
describe("SAN-1206 broker viewing-action surface contract", () => {
  const actions = read(join(COMPONENTS, "broker-viewing-request-actions.tsx"));
  const surface = read(join(COMPONENTS, "broker-viewing-requests.tsx"));

  it("renders actions from the persisted status and instant, not from a local copy", () => {
    // If the card ever passed a locally-tracked status, a successful action could display a
    // value the database never committed. Both props must come straight off the request row.
    expect(surface).toContain("<BrokerViewingRequestActions");
    expect(surface).toContain("showingId={request.showingId}");
    expect(surface).toContain("status={request.status}");
    expect(surface).toContain("scheduledAt={request.scheduledAt}");
  });

  it("echoes the persisted expectation on every action so a stale page cannot win", () => {
    expect(actions).toContain("expectedStatus: status");
    expect(actions).toContain("expectedScheduledAt: scheduledAt");
  });

  it("exposes an addressable control for each transition", () => {
    expect(actions).toContain("viewing-request-confirm-${showingId}");
    expect(actions).toContain("viewing-request-decline-${showingId}");
    expect(actions).toContain("viewing-request-reschedule-${showingId}");
    expect(actions).toContain("viewing-request-reschedule-input-${showingId}");
    expect(actions).toContain("viewing-request-reschedule-submit-${showingId}");
    expect(actions).toContain("viewing-request-error-${showingId}");
  });

  it("states the documented conflict copy verbatim", () => {
    expect(actions).toContain("This request changed. Refresh and try again.");
    // A 409 is its own outcome: it must not fall through to the generic failure branch.
    expect(actions).toContain("response.status === 409");
  });

  it("takes the reschedule time as a listing-local wall clock", () => {
    // The offset-free control is what makes the server-side Medellín conversion necessary.
    expect(actions).toContain('type="datetime-local"');
    expect(actions).toContain("newWallClock");
  });

  it("re-reads server truth on success and never invents a status locally", () => {
    expect(actions).toContain("router.refresh()");
    // The component must hold no state for status: any local status would be a second, possibly
    // wrong, source of truth next to the Server Component.
    expect(actions).not.toMatch(/set[A-Za-z]*Status\s*\(/);
    expect(actions).not.toMatch(/useState<[^>]*status[^>]*>/i);
  });

  it("offers nothing for a status whose actions are closed", () => {
    // Derived from the same function the DB contract mirrors, so a completed or cancelled
    // viewing renders read-only instead of offering a transition that would be refused.
    expect(actions).toContain("availableBrokerViewingActions(status)");
    expect(actions).toContain("if (actions.length === 0)");
  });

  it("disables only the card being acted on", () => {
    // `pending` is per-instance state, so one in-flight action cannot freeze the whole queue.
    expect(actions).toContain("useState<BrokerViewingAction | null>(null)");
    expect(actions).toContain("const busy = pending !== null");
  });

  it("never reaches for a service-role client from the route", () => {
    expect(read(ROUTE)).toContain('from "@/lib/supabase/server"');
    expect(read(ROUTE)).toContain("supabase.auth.getUser()");
    expect(read(ROUTE)).not.toMatch(/service[_-]?role/i);
  });
});
