/**
 * Classifies the account-scoped saved-vote read. Pure: no network, no React.
 *
 * The rule that matters: only an EXPLICIT `receipt: null` proves the server found no ballot.
 * A missing property, a null payload, or a malformed id means UNKNOWN — never "no vote", because
 * treating a broken read as absence is what invites a second ballot.
 */
export type SavedVoteReceipt = {
  voteId: string;
  entityId: string;
  createdAt: string | null;
  status: string;
};

export type SavedVote =
  | { kind: "receipt"; receipt: SavedVoteReceipt }
  | { kind: "already-voted"; restaurantName: string | null }
  | { kind: "none" }
  | { kind: "sign-in" }
  | { kind: "unknown" };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function resolveSavedVote(status: number, payload: unknown, targetEntityId: string): SavedVote {
  if (status === 401) return { kind: "sign-in" };
  if (status !== 200) return { kind: "unknown" };            // 502/503/network: unproven, not absent
  if (payload === null || typeof payload !== "object" || !("receipt" in payload)) {
    return { kind: "unknown" };                              // unexpected shape is not proof of absence
  }
  const receipt = (payload as { receipt: unknown }).receipt;
  if (receipt === null) return { kind: "none" };             // the only proof of absence
  if (typeof receipt !== "object") return { kind: "unknown" };
  const r = receipt as Record<string, unknown>;
  const voteId = r.vote_id;
  const entityId = r.entity_id;
  if (typeof voteId !== "string" || !UUID_RE.test(voteId)) return { kind: "unknown" };
  if (typeof entityId !== "string" || !UUID_RE.test(entityId)) return { kind: "unknown" };
  if (entityId !== targetEntityId) {
    return {
      kind: "already-voted",
      restaurantName: typeof r.restaurant_name === "string" ? r.restaurant_name : null,
    };
  }
  return {
    kind: "receipt",
    receipt: {
      voteId,
      entityId,
      createdAt: typeof r.created_at === "string" ? r.created_at : null,
      status: typeof r.status === "string" ? r.status : "cast",
    },
  };
}