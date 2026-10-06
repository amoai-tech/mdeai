import { createTool } from "@mastra/core/tools";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import { getSupabaseServerAnonEnv } from "@/lib/supabase/server-env";
import { rowToUnitType } from "@/lib/new-projects/mappers";
import {
  formatDelivery,
  formatPriceFromCents,
  formatPriceRangeLabel,
  formatUnitAreas,
  formatVerified,
  projectStatusLabel,
} from "@/lib/new-projects/format";
import type {
  DevelopmentProjectRow,
  DevelopmentProjectSourceRow,
  DevelopmentUnitTypeRow,
} from "@/lib/new-projects/types";

export const compareUnitSchema = z.object({
  name: z.string(),
  builtAreaM2: z.number().nullable(),
  privateAreaM2: z.number().nullable(),
  bedrooms: z.number().nullable(),
  bathrooms: z.number().nullable(),
  priceLabel: z.string().nullable(),
  areasLabel: z.string(),
});

export const compareProjectSchema = z.object({
  slug: z.string(),
  name: z.string(),
  neighborhood: z.string().nullable(),
  sourceOwner: z.string().nullable(),
  priceLabel: z.string(),
  deliveryLabel: z.string(),
  statusLabel: z.string().nullable(),
  verifiedLabel: z.string(),
  primarySourceUrl: z.string().nullable(),
  unitTypes: z.array(compareUnitSchema),
  unknownFields: z.array(z.string()),
});

export type CompareProject = z.infer<typeof compareProjectSchema>;

function unknownFields(row: DevelopmentProjectRow, unitTypes: DevelopmentUnitTypeRow[]): string[] {
  const unknown: string[] = [];
  if (row.price_from_cents == null && row.price_to_cents == null) unknown.push("price");
  if (row.expected_delivery_year == null && !row.delivery_note) unknown.push("delivery date");
  if (unitTypes.length === 0) unknown.push("unit types");
  return unknown;
}

/**
 * Pure comparison builder. It returns the requested projects in the requested order, each with
 * its typologies and explicit unknowns, and names any slug that is missing or unpublished.
 * No fact is inferred or averaged.
 */
export function buildProjectComparison(
  projects: DevelopmentProjectRow[],
  units: DevelopmentUnitTypeRow[],
  sources: DevelopmentProjectSourceRow[],
  slugs: string[],
): { projects: CompareProject[]; missing: string[] } {
  const bySlug = new Map(projects.map((project) => [project.slug, project]));
  const unitsByProject = new Map<string, DevelopmentUnitTypeRow[]>();
  for (const unit of units) {
    const bucket = unitsByProject.get(unit.project_id) ?? [];
    bucket.push(unit);
    unitsByProject.set(unit.project_id, bucket);
  }
  const sourceById = new Map(sources.map((source) => [source.id, source]));

  const compared: CompareProject[] = [];
  const missing: string[] = [];

  for (const slug of slugs) {
    const row = bySlug.get(slug);
    if (!row) {
      missing.push(slug);
      continue;
    }
    const projectUnits = unitsByProject.get(row.id) ?? [];
    const primary = row.primary_source_id ? sourceById.get(row.primary_source_id) : undefined;
    compared.push({
      slug: row.slug,
      name: row.name,
      neighborhood: row.neighborhood,
      sourceOwner: row.source_owner,
      priceLabel: formatPriceRangeLabel(row.price_from_cents, row.price_to_cents, row.currency),
      deliveryLabel: formatDelivery(
        row.expected_delivery_year,
        row.expected_delivery_quarter,
        row.delivery_note,
      ),
      statusLabel: projectStatusLabel(row.project_status),
      verifiedLabel: formatVerified(row.verified_at),
      primarySourceUrl: primary?.source_url ?? null,
      unitTypes: projectUnits.map((unit) => ({
        name: unit.name,
        builtAreaM2: unit.built_area_m2,
        privateAreaM2: unit.private_area_m2,
        bedrooms: unit.bedrooms,
        bathrooms: unit.bathrooms,
        priceLabel:
          unit.price_from_cents != null
            ? formatPriceFromCents(unit.price_from_cents, unit.currency)
            : null,
        areasLabel: formatUnitAreas(rowToUnitType(unit)),
      })),
      unknownFields: unknownFields(row, projectUnits),
    });
  }

  return { projects: compared, missing };
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

/**
 * SAN-1380 — grounded side-by-side comparison of 2 to 4 published projects. It returns the
 * exact published facts plus each project's typologies and explicit unknowns; the model may
 * narrate differences but must not introduce a fact that is absent here.
 */
export const compareNewProjectsTool = createTool({
  id: "compare-new-projects",
  description:
    "Compare 2 to 4 published Medellín new-construction projects side by side. Returns each project's price-from, delivery, status, typologies and provenance, plus explicit unknowns. Never invents a missing value and never presents a unit type as available inventory. Does not register a lead or book a visit.",
  inputSchema: z.object({
    slugs: z.array(z.string().min(1)).min(2).max(4).describe("Project slugs from search-new-projects"),
  }),
  outputSchema: z.object({
    projects: z.array(compareProjectSchema),
    missing: z.array(z.string()),
    note: z.string(),
  }),
  execute: async (input: { slugs: string[] }) => {
    const supabase = getSupabaseClient();
    if (!supabase) throw new Error("Supabase anon environment is not configured");

    const { data, error } = await supabase
      .from("development_projects")
      .select("*")
      .eq("publish_state", "published")
      .in("slug", input.slugs);
    if (error) throw new Error("Failed to load projects: " + error.message);

    const projects = (data ?? []) as DevelopmentProjectRow[];
    const ids = projects.map((project) => project.id);

    let units: DevelopmentUnitTypeRow[] = [];
    let sources: DevelopmentProjectSourceRow[] = [];
    if (ids.length > 0) {
      const [unitsResult, sourcesResult] = await Promise.all([
        supabase.from("development_unit_types").select("*").in("project_id", ids),
        supabase.from("development_project_sources").select("*").in("project_id", ids),
      ]);
      if (unitsResult.error) throw new Error("Failed to load unit types: " + unitsResult.error.message);
      if (sourcesResult.error) throw new Error("Failed to load provenance: " + sourcesResult.error.message);
      units = (unitsResult.data ?? []) as DevelopmentUnitTypeRow[];
      sources = (sourcesResult.data ?? []) as DevelopmentProjectSourceRow[];
    }

    const { projects: compared, missing } = buildProjectComparison(projects, units, sources, input.slugs);
    return {
      projects: compared,
      missing,
      note: "Price is price-from, not an exact unit price. Typologies are not availability. Missing slugs are not published projects.",
    };
  },
});
