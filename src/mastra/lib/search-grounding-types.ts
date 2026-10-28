import { z } from "zod";

/** GS-001 — Google Search grounding sidecar → Mastra bridge */

export const WebCitationSchema = z.object({
  title: z.string(),
  url: z.string().url(),
  snippet: z.string().nullable().optional(),
});

export type WebCitation = z.infer<typeof WebCitationSchema>;

export const SearchGroundedMetadataSchema = z.object({
  reason: z.string().nullable(),
  source: z.enum(["google-search-grounding", "unverified"]),
  searchDisabled: z.boolean().optional(),
  answer: z.string().optional(),
  webSearchQueries: z.array(z.string()).optional(),
  requestId: z.string().optional(),
  message: z.string().optional(),
});

export const SearchGroundedResponseSchema = z.object({
  answer: z.string().optional(),
  citations: z.array(WebCitationSchema),
  confidence: z.number().min(0).max(1),
  webSearchQueries: z.array(z.string()).optional(),
  metadata: SearchGroundedMetadataSchema,
});

export type SearchGroundedResponse = z.infer<typeof SearchGroundedResponseSchema>;

export const EventCandidateSchema = z.object({
  title: z.string(),
  startAt: z.string().optional(),
  venueName: z.string().optional(),
  ticketUrl: z.string().url().optional(),
  citations: z.array(WebCitationSchema).min(1),
  source: z.literal("web_candidate"),
  confidence: z.number(),
});

export type EventCandidate = z.infer<typeof EventCandidateSchema>;

/** Normalize sidecar invoke payload for search_grounded_events. */
export function parseSearchGroundedSidecarPayload(
  raw: unknown,
): SearchGroundedResponse {
  const row =
    raw && typeof raw === "object"
      ? (raw as Record<string, unknown>)
      : {};
  const meta =
    row.metadata && typeof row.metadata === "object"
      ? (row.metadata as Record<string, unknown>)
      : {};
  const citationsRaw = Array.isArray(row.citations) ? row.citations : [];
  // The sidecar's provenance is the only evidence that a response came from
  // Google's live Search grounding. A 200 response with arbitrary links or a
  // failure reason is NOT proof, even if a provider field is present.
  const isVerified =
    meta.source === "google-search-grounding" &&
    (meta.reason === null || meta.reason === undefined) &&
    meta.searchDisabled !== true;

  const citations: WebCitation[] = [];
  if (isVerified) {
    for (const c of citationsRaw) {
      if (!c || typeof c !== "object") continue;
      const item = c as Record<string, unknown>;
      const url = typeof item.url === "string" ? item.url : "";
      let protocol: string;
      try {
        protocol = new URL(url).protocol;
      } catch {
        continue;
      }
      if (protocol !== "https:" && protocol !== "http:") continue;
      const candidate = WebCitationSchema.safeParse({
        url,
        title:
          typeof item.title === "string" && item.title.trim()
            ? item.title
            : url,
        snippet: typeof item.snippet === "string" ? item.snippet : null,
      });
      if (candidate.success) citations.push(candidate.data);
    }
  }

  const reason =
    typeof meta.reason === "string"
      ? meta.reason
      : !isVerified
        ? "unverified_source"
        : citations.length === 0
          ? "no_grounding_metadata"
          : null;

  const confidence =
    isVerified &&
    typeof row.confidence === "number" &&
    Number.isFinite(row.confidence) &&
    row.confidence >= 0 &&
    row.confidence <= 1 &&
    citations.length > 0
      ? row.confidence
      : 0;

  const webSearchQueries = isVerified && Array.isArray(meta.webSearchQueries)
    ? meta.webSearchQueries.filter((q): q is string => typeof q === "string")
    : undefined;

  return SearchGroundedResponseSchema.parse({
    answer: isVerified && typeof meta.answer === "string" ? meta.answer : "",
    citations,
    confidence,
    webSearchQueries,
    metadata: {
      reason,
      source: isVerified ? "google-search-grounding" : "unverified",
      searchDisabled: meta.searchDisabled === true,
      answer: isVerified && typeof meta.answer === "string" ? meta.answer : undefined,
      webSearchQueries,
      requestId: typeof meta.requestId === "string" ? meta.requestId : undefined,
      message: typeof meta.message === "string" ? meta.message : undefined,
    },
  });
}
