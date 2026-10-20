import { z } from "zod";

/** A stable JSON representation for hashing and exact-draft comparison. */
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .filter((key) => record[key] !== undefined)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`)
    .join(",")}}`;
}

/** SHA-256 of the exact canonical draft; works in the browser, Node and Deno. */
export async function computeDraftHash(draft: unknown): Promise<string> {
  const bytes = new TextEncoder().encode(canonicalJson(draft));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export const reviewTargetSchema = z.object({
  kind: z.enum(["event", "venue", "partner"]),
  id: z.string().min(1),
});

export const reviewProposalSchema = z.object({
  proposalId: z.string().min(1).max(128),
  target: reviewTargetSchema,
  baseVersion: z.string().min(1).max(128),
  draftHash: z.string().regex(/^[a-f0-9]{64}$/),
  draft: z.unknown(),
  createdAt: z.string().datetime().optional(),
});

export type ReviewProposal = z.infer<typeof reviewProposalSchema>;

export const reviewReceiptSchema = z.object({
  proposalId: z.string().min(1),
  status: z.enum(["saved", "conflict", "failed", "cancelled"]),
  savedId: z.string().min(1).optional(),
  readbackUrl: z.string().min(1).optional(),
  message: z.string().min(1),
  savedAt: z.string().datetime().optional(),
});

export type ReviewReceipt = z.infer<typeof reviewReceiptSchema>;

export async function createReviewProposal(input: {
  proposalId: string;
  target: ReviewProposal["target"];
  baseVersion: string;
  draft: unknown;
  createdAt?: string;
}): Promise<ReviewProposal> {
  return reviewProposalSchema.parse({
    proposalId: input.proposalId,
    target: input.target,
    baseVersion: input.baseVersion,
    draft: input.draft,
    draftHash: await computeDraftHash(input.draft),
    createdAt: input.createdAt ?? new Date().toISOString(),
  });
}

export function reviewReceipt(input: ReviewReceipt): ReviewReceipt {
  return reviewReceiptSchema.parse(input);
}
