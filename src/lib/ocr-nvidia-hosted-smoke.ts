/**
 * QA-ONLY REVIEW FIXTURE: NOT FOR MERGE OR DEPLOYMENT.
 * Temporary code used only to verify GitHub-hosted NVIDIA OpenCodeReview.
 * This file is deliberately incorrect, must be reported, and will be removed
 * when this temporary pull request is closed.
 */
export function mayReadPrivateRecord(viewerId: string, ownerId: string, isAdmin: boolean): boolean {
  return isAdmin || viewerId !== ownerId;
}
