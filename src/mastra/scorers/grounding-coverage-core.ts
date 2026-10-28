import {
  extractClaims,
  type FaithfulnessInput,
  type FaithfulnessReply,
} from "./faithfulness-core";
import type { FaithfulnessClaim, FaithfulnessVerdict } from "./verdict-schema";

/**
 * AGT-00B — deterministic grounding-coverage core (SAN-605).
 *
 * Complements faithfulness (00A): faithfulness grades *all* checkable claims
 * (entities, prices, IDs). Coverage grades **entity mentions only** — whether
 * every named venue/listing/event in the reply maps to tool output.
 *
 * Example: tool returns 3 restaurants; reply names 5 — coverage flags the 2
 * extras even when prices happen to match (faithfulness may still pass on price-only drift).
 */

export type GroundingCoverageInput = FaithfulnessInput;
export type GroundingCoverageReply = FaithfulnessReply;

/**
 * Canonical entity identity for both heuristic coverage and the NVIDIA judge.
 * Match against names returned by tools, never arbitrary JSON text.
 * A qualifier added or removed from a venue name changes its identity.
 */
const NON_IDENTIFYING_NAME_WORDS = new Set(["hotel", "the", "el", "la"]);

export function normalizeGroundingName(name: string): string {
  return name.normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function distinctNameWords(name: string): Set<string> {
  return new Set(normalizeGroundingName(name).split(" ")
    .filter((word) => word.length > 0 && !NON_IDENTIFYING_NAME_WORDS.has(word)));
}

export function sameGroundedEntityName(claim: string, sourceName: string): boolean {
  const claimWords = distinctNameWords(claim);
  const sourceWords = distinctNameWords(sourceName);
  return claimWords.size > 0 &&
    claimWords.size === sourceWords.size &&
    [...claimWords].every((word) => sourceWords.has(word));
}

export function groundedSourceNames(value: unknown): string[] {
  if (Array.isArray(value)) return value.flatMap(groundedSourceNames);
  if (!value || typeof value !== "object") return [];
  const names: string[] = [];
  for (const [key, entry] of Object.entries(value)) {
    if (["name", "title", "aliases", "alias", "venue_name", "listing_name", "event_name"].includes(key)) {
      if (typeof entry === "string") names.push(entry);
      if (Array.isArray(entry)) names.push(...entry.filter((item): item is string => typeof item === "string"));
    }
    if (entry && typeof entry === "object") names.push(...groundedSourceNames(entry));
  }
  return names;
}

function entityClaims(reply: string): FaithfulnessClaim[] {
  return extractClaims(reply).filter((c) => c.type === "entity");
}

/**
 * Coverage verdict: entity-claim precision against tool output.
 * score = supported entity claims / total entity claims; 1.0 when none.
 */
export function evaluateGroundingCoverage(
  input: GroundingCoverageInput,
  reply: GroundingCoverageReply,
): FaithfulnessVerdict {
  const claims = entityClaims(reply.reply ?? "");
  const names = groundedSourceNames(input?.toolOutputs ?? []);
  const unsupported = claims.filter((claim) =>
    !names.some((sourceName) => sameGroundedEntityName(claim.claim, sourceName)),
  );

  const claimCount = claims.length;
  const score =
    claimCount === 0 ? 1 : Number(((claimCount - unsupported.length) / claimCount).toFixed(4));
  const faithful = unsupported.length === 0;

  return {
    faithful,
    score,
    claimCount,
    unsupportedClaims: unsupported,
    judged: false,
    reason: buildCoverageReason(faithful, claimCount, unsupported),
  };
}

function buildCoverageReason(
  covered: boolean,
  claimCount: number,
  unsupported: FaithfulnessClaim[],
): string {
  if (claimCount === 0) {
    return "No named entities in the reply — nothing to check for tool-row coverage.";
  }
  if (covered) {
    return `All ${claimCount} named entity/entities in the reply appear in tool output.`;
  }
  const sample = unsupported
    .slice(0, 3)
    .map((c) => `"${c.claim}"`)
    .join(", ");
  return `${unsupported.length}/${claimCount} entity mention(s) not found in tool rows: ${sample}.`;
}
