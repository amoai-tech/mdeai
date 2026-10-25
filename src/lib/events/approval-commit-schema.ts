import { z } from "zod";
import { EventDraftStateSchema } from "@/lib/types";

export const ApprovalDecisionSchema = z.enum(["approved", "edit", "rejected"]);

export const ApprovalCommitInputSchema = z.object({
  decision: ApprovalDecisionSchema,
  draft: EventDraftStateSchema,
  approvalRequestId: z.string().uuid().optional(),
  proposalId: z.string().min(1).max(128).optional(),
  baseVersion: z.string().min(1).max(128).optional(),
  draftHash: z.string().regex(/^[a-f0-9]{64}$/).optional(),
  reason: z.string().max(500).optional(),
});

export type ApprovalCommitInput = z.infer<typeof ApprovalCommitInputSchema>;
