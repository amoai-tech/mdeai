import type { Database, Json } from "@/lib/supabase/database.types";
import { createClient } from "@/lib/supabase/server";
import {
  type OnboardingDraftPayload,
  type OnboardingStepId,
  type PartnerDraftType,
  draftPayloadSchema,
  emptyDraftPayload,
} from "./contracts";
import { onboardingStepIdAt } from "./definitions";

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

// ponytail: database.types.ts is generated and predates the
// 20261006131205_san1391_add_landlord_partner_type migration, so its enum union
// does not yet include 'landlord'. Remove this cast after the next
// `supabase gen types` run includes it.
function toDbPartnerType(type: PartnerDraftType): DbPartnerType {
  return type as unknown as DbPartnerType;
}

function fromDbPartnerType(type: DbPartnerType): PartnerDraftType {
  if (type === "broker") return "broker";
  if ((type as string) === "landlord") return "landlord";
  throw new Error(`partner_drafts.type "${type}" is not an onboarding type`);
}

const DRAFT_COLUMNS =
  "id, profile_id, type, step, payload, completion_score, submitted_at" as const;

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
}

interface PartnerDraftRow {
  id: string;
  profile_id: string;
  type: DbPartnerType;
  step: number;
  payload: Json;
  completion_score: number;
  submitted_at: string | null;
}

function mapRow(row: PartnerDraftRow): PartnerDraft {
  const parsed = draftPayloadSchema.safeParse(row.payload);
  const fallbackStepId: OnboardingStepId =
    onboardingStepIdAt(row.step) ?? "identity";
  return {
    id: row.id,
    profileId: row.profile_id,
    type: fromDbPartnerType(row.type),
    step: row.step,
    payload: parsed.success ? parsed.data : emptyDraftPayload(fallbackStepId),
    completionScore: row.completion_score,
    submittedAt: row.submitted_at,
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
  const payload = input.payload as unknown as Json;

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
    const { data, error } = await supabase
      .from("partner_drafts")
      .update(mutable)
      .eq("id", active.data.id)
      .select(DRAFT_COLUMNS)
      .single();
    if (error) {
      throw new Error(`upsertDraft update failed: ${error.message}`);
    }
    return mapRow(data as PartnerDraftRow);
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

  const recovered = await supabase
    .from("partner_drafts")
    .update(mutable)
    .eq("id", winner.data.id)
    .select(DRAFT_COLUMNS)
    .single();
  if (recovered.error) {
    throw new Error(
      `upsertDraft race update failed: ${recovered.error.message}`,
    );
  }
  return mapRow(recovered.data as PartnerDraftRow);
}
