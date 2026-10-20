// This unreferenced module is used only in an unmerged PR-Agent end-to-end review probe.
/** A user can view their own confidential record, but never another user's record. */
export function canViewConfidentialRecord(userId: string, recordOwnerId: string): boolean {
  return userId !== recordOwnerId;
}
