import { createTool } from "@mastra/core/tools";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import { getSupabaseServerAnonEnv } from "@/lib/supabase/server-env";
import { applyProjectFilters } from "@/lib/new-projects/filters";
import { rowToSummary } from "@/lib/new-projects/mappers";
import {
  formatBedrooms,
  formatCheckedAt,
  formatDelivery,
  formatPriceRangeLabel,
  formatVerified,
  projectStatusLabel,
  visLabel,
} from "@/lib/new-projects/format";
import type {
  DevelopmentProjectRow,
  DevelopmentProjectSourceRow,
  DevelopmentUnitTypeRow,
  NewProjectFilters,
  NewProjectSummary,
} from "@/lib/new-projects/types";

const UNIT_COLUMNS =
  "id,project_id,source_key,name,bedrooms,bathrooms,built_area_m2,private_area_m2,price_from_cents,price_to_cents,currency,availability,product_class,phase_label,source_kind,source_url,verified_at";

/** A grounded project card. Unknown facts are explicit strings, never zero/false/inferred. */
export { newProjectCardSchema, type NewProjectCard } from "@/lib/new-projects/search-envelope";
import { newProjectCardSchema, type NewProjectCard } from "@/lib/new-projects/search-envelope";

/**
 * The tool's input contract, shared by the Mastra tool and the HTTP route: the route validates
 * against THIS schema and then calls the same `searchNewProjects` application function, so an
 * agent-schema change cannot drift from the HTTP API. `limit` is capped at 5 to match the
 * concierge instruction ("Max 5 project cards per reply").
 */
export const searchNewProjectsInputSchema = z.object({
  neighborhood: z.string().optional().describe("e.g. Laureles, Ciudad del Río"),
  maxPriceCop: z
    .number()
    .int()
    .positive()
    .optional()
    .describe("Maximum price-from in COP pesos, e.g. 900000000"),
  /** "2+ bedrooms" / "at least 2" — any typology with that many or more. */
  minBedrooms: z.number().int().min(1).max(6).optional(),
  /** "2 bedroom" — a typology with exactly this count. Pass this OR minBedrooms, never both. */
  bedroomsExact: z.number().int().min(1).max(6).optional(),
  deliveryYear: z.number().int().min(2024).max(2040).optional(),
  /** True = only projects whose delivery date/note is not published. */
  deliveryUnknown: z.boolean().optional(),
  limit: z.number().int().min(1).max(5).default(5),
})
  .strict()
  .superRefine((value, ctx) => {
    if (value.bedroomsExact != null && value.minBedrooms != null) {
      ctx.addIssue({
        code: "custom",
        path: ["bedroomsExact"],
        message: "Pass either bedroomsExact (exactly N) or minBedrooms (N or more), not both.",
      });
    }
  });

export type NewProjectSearchInput = z.infer<typeof searchNewProjectsInputSchema>;

function unknownFieldsFor(summary: NewProjectSummary): string[] {
  const unknown: string[] = [];
  if (summary.priceFromCents == null && summary.priceToCents == null) unknown.push("price");
  if (summary.expectedDeliveryYear == null && !summary.deliveryNote) unknown.push("delivery date");
  if (summary.maxBedrooms == null) unknown.push("bedroom count");
  if (summary.unitTypeCount === 0) unknown.push("unit types");
  return unknown;
}

/**
 * Pure builder used by the tool and its tests. Hard filters run first, then a deterministic
 * sort (name), then the limit. Nothing here invents a fact; unknowns are named explicitly.
 */
export function buildNewProjectCards(
  projects: DevelopmentProjectRow[],
  units: DevelopmentUnitTypeRow[],
  sources: DevelopmentProjectSourceRow[],
  filters: NewProjectFilters,
  limit: number,
): NewProjectCard[] {
  const unitsByProject = new Map<string, DevelopmentUnitTypeRow[]>();
  for (const unit of units) {
    const bucket = unitsByProject.get(unit.project_id) ?? [];
    bucket.push(unit);
    unitsByProject.set(unit.project_id, bucket);
  }

  const sourceById = new Map(sources.map((source) => [source.id, source]));

  const summaries = projects.map((project) => ({
    row: project,
    summary: rowToSummary(project, unitsByProject.get(project.id) ?? []),
  }));

  const eligible = applyProjectFilters(
    summaries.map((entry) => entry.summary),
    filters,
  );
  const eligibleIds = new Set(eligible.map((summary) => summary.id));

  return summaries
    .filter((entry) => eligibleIds.has(entry.summary.id))
    .sort((a, b) => a.summary.name.localeCompare(b.summary.name))
    .slice(0, limit)
    .map(({ row, summary }) => {
      const primary = row.primary_source_id ? sourceById.get(row.primary_source_id) : undefined;
      const priceKnown = summary.priceFromCents != null || summary.priceToCents != null;
      return {
        slug: summary.slug,
        name: summary.name,
        neighborhood: summary.neighborhood,
        sourceOwner: summary.sourceOwner,
        priceLabel: formatPriceRangeLabel(
          summary.priceFromCents,
          summary.priceToCents,
          summary.currency,
        ),
        priceKnown,
        bedroomsLabel: formatBedrooms(summary.minBedrooms, summary.maxBedrooms),
        deliveryLabel: formatDelivery(
          summary.expectedDeliveryYear,
          summary.expectedDeliveryQuarter,
          summary.deliveryNote,
        ),
        statusLabel: projectStatusLabel(summary.projectStatus),
        visLabel: visLabel(summary.visFlag),
        unitTypeCount: summary.unitTypeCount,
        verifiedLabel: formatVerified(summary.verifiedAt),
        detailUrl: "/new-projects/" + summary.slug,
        primarySourceUrl: primary?.source_url ?? null,
        primarySourceCheckedLabel: primary ? formatCheckedAt(primary.checked_at) : null,
        unknownFields: unknownFieldsFor(summary),
      };
    });
}

let _client: ReturnType<typeof createClient> | null = null;

function getSupabaseClient() {
  if (_client) return _client;
  const env = getSupabaseServerAnonEnv();
  if (!env) return null;
  _client = createClient(env.url, env.anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  return _client;
}

export interface NewProjectSearchResult {
  results: NewProjectCard[];
  totalPublished: number;
  returned: number;
  note: string;
}

/**
 * The application search: hard filters first, published rows only (RLS), grounded cards with
 * provenance and explicit unknowns. Both the Mastra tool and the HTTP route call THIS, so the
 * route never reaches into Mastra's internal `execute` callback — and a tool-contract change
 * cannot silently turn a server failure into a fake empty 200.
 */
export async function searchNewProjects(
  input: NewProjectSearchInput,
): Promise<NewProjectSearchResult> {
  const {
    neighborhood,
    maxPriceCop,
    minBedrooms,
    bedroomsExact,
    deliveryYear,
    deliveryUnknown,
    limit = 5,
  } = input;
  const filters: NewProjectFilters = {
    neighborhood: neighborhood ?? null,
    maxPriceCop: maxPriceCop ?? null,
    minBedrooms: minBedrooms ?? null,
    bedroomsExact: bedroomsExact ?? null,
    deliveryYear: deliveryYear ?? null,
    deliveryUnknown: deliveryUnknown ?? false,
  };

  const supabase = getSupabaseClient();
  if (!supabase) {
    throw new Error("Supabase anon environment is not configured");
  }

  const { data: projectData, error: projectError } = await supabase
    .from("development_projects")
    .select("*")
    .eq("publish_state", "published")
    .order("name", { ascending: true });
  if (projectError) {
    throw new Error("Failed to load new projects: " + projectError.message);
  }

  const projects = (projectData ?? []) as DevelopmentProjectRow[];
  const ids = projects.map((project) => project.id);

  let units: DevelopmentUnitTypeRow[] = [];
  let sources: DevelopmentProjectSourceRow[] = [];
  if (ids.length > 0) {
    const [unitsResult, sourcesResult] = await Promise.all([
      supabase.from("development_unit_types").select(UNIT_COLUMNS).in("project_id", ids),
      supabase.from("development_project_sources").select("*").in("project_id", ids),
    ]);
    if (unitsResult.error) {
      throw new Error("Failed to load project unit types: " + unitsResult.error.message);
    }
    if (sourcesResult.error) {
      throw new Error("Failed to load project provenance: " + sourcesResult.error.message);
    }
    units = (unitsResult.data ?? []) as DevelopmentUnitTypeRow[];
    sources = (sourcesResult.data ?? []) as DevelopmentProjectSourceRow[];
  }

  const results = buildNewProjectCards(projects, units, sources, filters, limit);
  return {
    results,
    totalPublished: projects.length,
    returned: results.length,
    note:
      results.length === 0
        ? "No published projects matched those hard filters. Unknown facts are excluded, not guessed."
        : "Price is price-from, not an exact unit price. Unit types are not exact unit availability.",
  };
}

/**
 * SAN-1380 — deterministic eligibility search for New Projects. It applies the buyer's hard
 * filters BEFORE any ranking or model narration, reads only published projects through RLS,
 * and returns provenance for every card. It never creates a lead and never invents a fact.
 */
export const searchNewProjectsTool = createTool({
  id: "search-new-projects",
  description:
    "Find published Medellín new-construction projects by neighborhood, price-from, bedrooms and expected delivery year. Applies hard filters before ranking and returns grounded project cards with price-from semantics, delivery wording and provenance (source URL + checked date). Unknown facts are returned as explicit text such as 'Not published'; never present them as zero, false, available or inferred. This tool does not register a lead or book a visit.",
  inputSchema: searchNewProjectsInputSchema,
  outputSchema: z.object({
    results: z.array(newProjectCardSchema),
    totalPublished: z.number(),
    returned: z.number(),
    note: z.string(),
  }),
  execute: searchNewProjects,
});
