import type { Database, Json } from "@/lib/supabase/database.types";
import { createClient } from "@/lib/supabase/server";
import {
  type OnboardingDraftPayload,
  type PartnerDraftType,
} from "./contracts";
import {
  parseDraftWritePayload,
  parseStoredDraftPayload,
} from "./definitions";
import { evaluateOnboarding } from "./state";

/**
 * SAN-1391 — thin server-only adapter over the EXISTING public.partner_drafts
 * table. It deliberately adds no table, index, or idempotency system: the race
 * guard is the existing partial unique index
 * `idx_partner_drafts_active_unique (profile_id, type) WHERE submitted_at IS NULL`.
 *
 * Two invariants live here:
 *   * `completion_score` is derived from `evaluateOnboarding`, never supplied by
 *     the caller, so the database can never disagree with canonical readiness.
 *   * concurrency fails closed. An update needs a matching `expectedUpdatedAt`;
 *     a lost insert race returns a conflict carrying the winning draft instead of
 *     overwriting it.
 */

type DbPartnerType = Database["public"]["Enums"]["partner_type"];

// The generated enum union includes "landlord" (added by the SAN-1391 migration),
// so a PartnerDraftType is already a valid partner_type and no cast is needed.
function toDbPartnerType(type: PartnerDraftType): DbPartnerType {
  return type;
}

/**
 * Onboarding drafts are only ever landlord or broker. Every query in this adapter
 * filters on those values, so a row of any other partner_type means a caller
 * selected without the filter — a programming error. The predicate is exported
 * for any future query that does not filter; `fromDbPartnerType` then throws
 * loudly rather than coercing an unrelated type into an onboarding draft.
 */
export function isOnboardingPartnerType(
  type: string,
): type is PartnerDraftType {
  return type === "landlord" || type === "broker";
}

function fromDbPartnerType(type: DbPartnerType): PartnerDraftType {
  if (isOnboardingPartnerType(type)) return type;
  throw new Error(`partner_drafts.type "${type}" is not an onboarding type`);
}

const DRAFT_COLUMNS =
  "id, profile_id, type, step, payload, completion_score, submitted_at, updated_at" as const;

/** Normalized, camelCase draft returned by the adapter. */
export interface PartnerDraft {
  id: string;
  profileId: string;
  type: PartnerDraftType;
  /** 1-based canonical step index. */
  step: number;
  payload: OnboardingDraftPayload;
  /** Derived from canonical readiness when written; never caller-controlled. */
  completionScore: number;
  submittedAt: string | null;
  /** Concurrency token: pass to upsertDraft as expectedUpdatedAt. */
  updatedAt: string;
}

interface PartnerDraftRow {
  id: string;
  profile_id: string;
  type: DbPartnerType;
  step: number;
  payload: Json;
  completion_score: number;
  submitted_at: string | null;
  updated_at: string;
}

/**
 * Raised instead of silently winning or losing a concurrent write. `latest` is
 * the current stored draft (best effort) so the caller can reload and merge.
 */
export class DraftConflictError extends Error {
  readonly latest: PartnerDraft | null;

  constructor(message: string, latest: PartnerDraft | null) {
    super(message);
    this.name = "DraftConflictError";
    this.latest = latest;
  }
}

function mapRow(row: PartnerDraftRow): PartnerDraft {
  let payload: OnboardingDraftPayload;
  try {
    payload = parseStoredDraftPayload(row.payload);
  } catch (error) {
    // Do not silently replace a corrupt/stale payload with an empty draft: that
    // would discard the partner's answers while looking like a fresh start.
    throw new Error(
      `partner_drafts ${row.id} has an unreadable payload: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
  return {
    id: row.id,
    profileId: row.profile_id,
    type: fromDbPartnerType(row.type),
    step: row.step,
    payload,
    completionScore: row.completion_score,
    submittedAt: row.submitted_at,
    updatedAt: row.updated_at,
  };
}

export interface UpsertDraftInput {
  profileId: string;
  type: PartnerDraftType;
  /** 1-based canonical step index. */
  step: number;
  payload: OnboardingDraftPayload;
  partnerId?: string | null;
  threadId?: string | null;
  /**
   * Optimistic-concurrency token from a prior read. Required when an active
   * draft already exists, so a stale tab can never overwrite newer answers.
   */
  expectedUpdatedAt?: string;
}

/** Read the single unsubmitted draft for (profile, type), or null. */
export async function getActiveDraft(
  profileId: string,
  type: PartnerDraftType,
): Promise<PartnerDraft | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("partner_drafts")
    .select(DRAFT_COLUMNS)
    .eq("profile_id", profileId)
    .eq("type", toDbPartnerType(type))
    .is("submitted_at", null)
    .maybeSingle();

  if (error) {
    throw new Error(`getActiveDraft failed: ${error.message}`);
  }
  return data ? mapRow(data as PartnerDraftRow) : null;
}

/**
 * Create or update the active draft in one call.
 *
 * - The payload and step are validated before anything reaches the database.
 * - `completion_score` is derived from `evaluateOnboarding`.
 * - If a draft already exists, `expectedUpdatedAt` must match or a
 *   `DraftConflictError` is thrown.
 * - A lost insert race (23505) throws a `DraftConflictError` carrying the winner
 *   rather than overwriting it.
 */
export async function upsertDraft(
  input: UpsertDraftInput,
): Promise<PartnerDraft> {
  const supabase = await createClient();
  const dbType = toDbPartnerType(input.type);
  // Reject an unsupported payload version, unknown keys, or a step that
  // disagrees with payload.stepId before anything reaches the database: a
  // payload that mapRow would reject on the next read must never be written.
  const payload = parseDraftWritePayload(
    input.step,
    input.payload,
  ) as unknown as Json;

  // Canonical readiness is the only source for completion_score.
  const completionScore = evaluateOnboarding({
    step: input.step,
    payload: input.payload,
  }).completion;

  const mutable = {
    step: input.step,
    payload,
    completion_score: completionScore,
    ...(input.partnerId !== undefined ? { partner_id: input.partnerId } : {}),
    ...(input.threadId !== undefined ? { thread_id: input.threadId } : {}),
  };

  const active = await supabase
    .from("partner_drafts")
    .select(DRAFT_COLUMNS)
    .eq("profile_id", input.profileId)
    .eq("type", dbType)
    .is("submitted_at", null)
    .maybeSingle();

  if (active.error) {
    throw new Error(`upsertDraft lookup failed: ${active.error.message}`);
  }

  if (active.data) {
    const existing = active.data as PartnerDraftRow;
    if (input.expectedUpdatedAt === undefined) {
      throw new DraftConflictError(
        "an active draft already exists; reload before saving",
        mapRow(existing),
      );
    }
    return updateExistingDraft(existing.id, mutable, input.expectedUpdatedAt);
  }

  const { data, error } = await supabase
    .from("partner_drafts")
    .insert({
      ...mutable,
      profile_id: input.profileId,
      type: dbType,
    })
    .select(DRAFT_COLUMNS)
    .single();

  if (!error) {
    return mapRow(data as PartnerDraftRow);
  }

  if (error.code !== "23505") {
    throw new Error(`upsertDraft insert failed: ${error.message}`);
  }

  // Lost the insert race. Never overwrite the winner: report a conflict with the
  // winning row so the caller reloads and merges deliberately.
  const winner = await supabase
    .from("partner_drafts")
    .select(DRAFT_COLUMNS)
    .eq("profile_id", input.profileId)
    .eq("type", dbType)
    .is("submitted_at", null)
    .maybeSingle();

  if (winner.error) {
    throw new Error(`upsertDraft race lookup failed: ${winner.error.message}`);
  }

  throw new DraftConflictError(
    "another session created this draft first; reload before saving",
    winner.data ? mapRow(winner.data as PartnerDraftRow) : null,
  );
}

async function updateExistingDraft(
  id: string,
  mutable: Record<string, unknown>,
  expectedUpdatedAt: string,
): Promise<PartnerDraft> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("partner_drafts")
    .update(mutable)
    .eq("id", id)
    .eq("updated_at", expectedUpdatedAt)
    .select(DRAFT_COLUMNS)
    .maybeSingle();

  if (error) {
    throw new Error(`upsertDraft update failed: ${error.message}`);
  }
  if (!data) {
    const latest = await supabase
      .from("partner_drafts")
      .select(DRAFT_COLUMNS)
      .eq("id", id)
      .maybeSingle();
    throw new DraftConflictError(
      "the draft changed since it was loaded; reload before saving",
      latest.data ? mapRow(latest.data as PartnerDraftRow) : null,
    );
  }
  return mapRow(data as PartnerDraftRow);
}
