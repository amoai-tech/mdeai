import { normalizeToolEnvelope, isFinishedToolPayload } from "@/lib/normalize-tool-envelope";
import { parseGroundedToolResult, type GroundedToolRow } from "@/lib/parse-grounded-tool-result";
import type { Restaurant } from "@/mastra/tools/search-restaurants";
import type { DiscoveryPage } from "./discovery-page-context";

export type DiscoveryAgentResult =
  | { page: "restaurants"; rows: Restaurant[] }
  | { page: "events"; ids: string[] }
  | { page: "cafes" | "nightlife"; rows: GroundedToolRow[] };
type ToolMessage = {
  role?: string;
  toolCallId?: string;
  toolCalls?: Array<{ id?: string; function?: { name?: string } }>;
  content?: unknown;
};
const toolCategory = (name: string): DiscoveryPage | null => {
  if (/search[-_]?restaurants|searchRestaurantsTool/i.test(name)) return "restaurants";
  if (/search[-_]?events|searchEventsTool/i.test(name)) return "events";
  if (/search[-_]?grounded[-_]?places|searchGroundedPlacesTool/i.test(name)) return "cafes";
  return null;
};
const validUuid = (id: unknown): id is string =>
  typeof id === "string" && /^[a-f\d]{8}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{12}$/i.test(id);
const validCoordinate = (n: unknown, min: number, max: number) =>
  typeof n === "number" && Number.isFinite(n) && n >= min && n <= max;
function isRestaurant(row: unknown): row is Restaurant {
  if (!row || typeof row !== "object" || Array.isArray(row)) return false;
  const r = row as Record<string, unknown>;
  return typeof r.id === "string" && r.id.length > 0 &&
    typeof r.name === "string" && r.name.trim().length > 0 &&
    typeof r.neighborhood === "string" && typeof r.cuisine === "string" &&
    (r.latitude == null || validCoordinate(r.latitude, -90, 90)) &&
    (r.longitude == null || validCoordinate(r.longitude, -180, 180)) &&
    ((r.latitude == null && r.longitude == null) ||
      (r.latitude != null && r.longitude != null)) &&
    (r.imageUrl === undefined || typeof r.imageUrl === "string") &&
    (r.mapsUrl === undefined || r.mapsUrl === null || typeof r.mapsUrl === "string") &&
    (r.priceTier === undefined || ["$", "$$", "$$$", "$$$$"].includes(String(r.priceTier))) &&
    (r.rating === undefined || (typeof r.rating === "number" && r.rating >= 0 && r.rating <= 5));
}
export function getLatestDiscoveryToolResult(
  messages: readonly ToolMessage[],
  page: Exclude<DiscoveryPage, "rentals">,
  since = 0,
): DiscoveryAgentResult | null {
  const calls = new Map<string, string>();
  messages.forEach((m) => {
    if (m.role !== "assistant") return;
    for (const call of m.toolCalls ?? []) {
      if (call.id && call.function?.name) calls.set(call.id, call.function.name);
    }
  });
  // The latest complete tool owns the current cards; don't resurrect an older search from another page.
  // Iterate a copied slice newest-first; never index agent messages using a computed key.
  for (const m of messages.slice(Math.max(0, since)).reverse()) {
    if (m.role !== "tool" || !m.toolCallId) continue;
    const category = toolCategory(calls.get(m.toolCallId) ?? "");
    if (!category || !isFinishedToolPayload(m.content, { rowArray: true })) continue;
    if (category === "restaurants") {
      if (page !== "restaurants") return null;
      const results = normalizeToolEnvelope(m.content).results;
      if (!results || results.length > 20 || !results.every(isRestaurant)) return null;
      return { page: "restaurants", rows: results };
    }
    if (category === "events") {
      if (page !== "events") return null;
      const results = normalizeToolEnvelope(m.content).results;
      if (!results || results.length > 20 || !results.every((r) =>
        r && typeof r === "object" && validUuid((r as { id?: unknown }).id))) return null;
      return { page: "events", ids: results.map((r) => (r as { id: string }).id) };
    }
    if (page !== "cafes" && page !== "nightlife") return null;
    const parsed = parseGroundedToolResult(m.content);
    if (parsed.venueKind && parsed.venueKind !== (page === "cafes" ? "cafe" : "nightlife")) return null;
    if (parsed.results.length > 20 || parsed.results.some((r) =>
      !r.id || !r.title || !r.mapsUrl ||
      (r.latitude != null && !validCoordinate(r.latitude, -90, 90)) ||
      (r.longitude != null && !validCoordinate(r.longitude, -180, 180)))) return null;
    return { page, rows: parsed.results };
  }
  return null;
}
