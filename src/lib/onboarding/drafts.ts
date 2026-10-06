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

/**
 * SAN-1391 — thin server-only adapter over the EXISTING public.partner_drafts
 * table. It deliberately adds no table, index, or idempotency system: the race
 * guard is the existing partial unique index
 * `idx_partner_drafts_active_unique (profile_id, type) WHERE submitted_at IS NULL`.
 *
 * The actor-role -> partner_drafts.type mapping itself lives in contracts.ts so
 * it stays pure and unit-testable.
 */

type DbPartnerType = Database["public"]["Enums"]["partner_type"];

// The generated enum union includes "landlord" (added by the SAN-1391 migration),
// so a PartnerDraftType is already a valid partner_type and no cast is needed.
function toDbPartnerType(type: PartnerDraftType): DbPartnerType {
  return type;
}

function fromDbPartnerType(type: DbPartnerType): PartnerDraftType {
  if (type === "broker") return "broker";
  if ((type as string) === "landlord") return "landlord";
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
  completionScore?: number;
  partnerId?: string | null;
  threadId?: string | null;
  /**
   * Optimistic-concurrency token. When provided, the update only applies if the
   * stored `updated_at` still matches; otherwise it throws a conflict. This is
   * what stops an older tab from overwriting newer answers.
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
 * Create or update the active draft in one call. Safe under the
 * (profile_id, type) WHERE submitted_at IS NULL uniqueness: a concurrent insert
 * loses with 23505 and is retried as an update of the winning row.
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

  const mutable = {
    step: input.step,
    payload,
    ...(input.completionScore !== undefined
      ? { completion_score: input.completionScore }
      : {}),
    ...(input.partnerId !== undefined ? { partner_id: input.partnerId } : {}),
    ...(input.threadId !== undefined ? { thread_id: input.threadId } : {}),
  };

  const active = await supabase
    .from("partner_drafts")
    .select("id")
    .eq("profile_id", input.profileId)
    .eq("type", dbType)
    .is("submitted_at", null)
    .maybeSingle();

  if (active.error) {
    throw new Error(`upsertDraft lookup failed: ${active.error.message}`);
  }

  if (active.data) {
    return updateExistingDraft(active.data.id, mutable, input.expectedUpdatedAt);
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

  // Race loss: another request inserted the active row first. Update it.
  const winner = await supabase
    .from("partner_drafts")
    .select("id")
    .eq("profile_id", input.profileId)
    .eq("type", dbType)
    .is("submitted_at", null)
    .maybeSingle();

  if (winner.error || !winner.data) {
    throw new Error(
      `upsertDraft race recovery failed: ${winner.error?.message ?? "no active draft"}`,
    );
  }

  return updateExistingDraft(winner.data.id, mutable, input.expectedUpdatedAt);
}

async function updateExistingDraft(
  id: string,
  mutable: Record<string, unknown>,
  expectedUpdatedAt: string | undefined,
): Promise<PartnerDraft> {
  const supabase = await createClient();
  let query = supabase.from("partner_drafts").update(mutable).eq("id", id);
  if (expectedUpdatedAt !== undefined) {
    query = query.eq("updated_at", expectedUpdatedAt);
  }

  const { data, error } = expectedUpdatedAt !== undefined
    ? await query.select(DRAFT_COLUMNS).maybeSingle()
    : await query.select(DRAFT_COLUMNS).single();

  if (error) {
    throw new Error(`upsertDraft update failed: ${error.message}`);
  }
  if (!data) {
    throw new Error(
      "upsertDraft conflict: the draft changed since it was loaded; reload before saving",
    );
  }
  return mapRow(data as PartnerDraftRow);
}
