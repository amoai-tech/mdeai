import type { BrokerViewingAction } from "./broker-viewing-action";

/**
 * SAN-1206 / SAN-1675 · the one browser call to the existing authorized viewing writer.
 *
 * The expectation (`status` + `scheduledAt`) is always the persisted value the page loaded,
 * so a request that moved meanwhile answers 409 instead of being overwritten. Shared by the
 * viewing-request card and the official-component Overview so their wire contract cannot drift.
 */
export const STALE_VIEWING_ACTION_MESSAGE = "This request changed. Refresh and try again.";

export type BrokerViewingActionResult = { ok: true } | { ok: false; error: string };

export async function submitBrokerViewingAction(input: {
  showingId: string;
  action: BrokerViewingAction;
  expectedStatus: string;
  expectedScheduledAt: string;
  newWallClock?: string;
}): Promise<BrokerViewingActionResult> {
  try {
    const response = await fetch(`/api/host/rentals/viewings/${encodeURIComponent(input.showingId)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: input.action,
        expectedStatus: input.expectedStatus,
        expectedScheduledAt: input.expectedScheduledAt,
        ...(input.newWallClock ? { newWallClock: input.newWallClock } : {}),
      }),
    });
    if (response.status === 409) return { ok: false, error: STALE_VIEWING_ACTION_MESSAGE };
    const body = (await response.json().catch(() => ({}))) as { error?: string };
    if (!response.ok) return { ok: false, error: body.error ?? "Couldn't update this request." };
    return { ok: true };
  } catch {
    return { ok: false, error: "Couldn't reach the server. Try again." };
  }
}
