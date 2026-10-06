import { createClient } from "@/lib/supabase/server";
import { applyProjectFilters } from "./filters";
import { buildDetail, rowToSummary } from "./mappers";
import type {
  DevelopmentProjectRow,
  DevelopmentProjectSourceRow,
  DevelopmentUnitTypeRow,
  NewProjectDetail,
  NewProjectFilters,
  NewProjectSummary,
} from "./types";

const UNIT_COLUMNS =
  "id,project_id,source_key,name,bedrooms,bathrooms,built_area_m2,private_area_m2,price_from_cents,price_to_cents,currency,availability,source_kind,source_url,verified_at";

/**
 * Public browse query. Runs through the request-scoped anon/authenticated Supabase client, so
 * row-level security restricts results to `publish_state = 'published'` projects and their
 * child rows. Filtering is deterministic and in-memory: the pilot set is ten projects, and a
 * missing fact excludes the project rather than being treated as a match.
 */
export interface NewProjectListResult {
  projects: NewProjectSummary[];
  totalPublished: number;
}

export async function listNewProjects(
  filters: NewProjectFilters,
): Promise<NewProjectListResult> {
  const supabase = await createClient();
  const { data: projectData, error: projectError } = await supabase
    .from("development_projects")
    .select("*")
    .eq("publish_state", "published")
    .order("name", { ascending: true });

  if (projectError) {
    throw new Error(`Failed to load new projects: ${projectError.message}`);
  }

  const projects = (projectData ?? []) as DevelopmentProjectRow[];
  const projectIds = projects.map((project) => project.id);

  let units: DevelopmentUnitTypeRow[] = [];
  if (projectIds.length > 0) {
    const { data: unitData, error: unitError } = await supabase
      .from("development_unit_types")
      .select(UNIT_COLUMNS)
      .in("project_id", projectIds);
    if (unitError) {
      throw new Error(`Failed to load project unit types: ${unitError.message}`);
    }
    units = (unitData ?? []) as DevelopmentUnitTypeRow[];
  }

  const unitsByProject = new Map<string, DevelopmentUnitTypeRow[]>();
  for (const unit of units) {
    const bucket = unitsByProject.get(unit.project_id) ?? [];
    bucket.push(unit);
    unitsByProject.set(unit.project_id, bucket);
  }

  const summaries = projects.map((project) =>
    rowToSummary(project, unitsByProject.get(project.id) ?? []),
  );
  return {
    projects: applyProjectFilters(summaries, filters),
    totalPublished: summaries.length,
  };
}

/** Public profile query by slug. Returns null for drafts or when the slug does not exist. */
export async function getNewProjectBySlug(slug: string): Promise<NewProjectDetail | null> {
  const supabase = await createClient();
  const { data: project, error: projectError } = await supabase
    .from("development_projects")
    .select("*")
    .eq("slug", slug)
    .eq("publish_state", "published")
    .maybeSingle();

  if (projectError) {
    throw new Error(`Failed to load project "${slug}": ${projectError.message}`);
  }
  if (!project) return null;

  const row = project as DevelopmentProjectRow;
  const [unitsResult, sourcesResult] = await Promise.all([
    supabase.from("development_unit_types").select(UNIT_COLUMNS).eq("project_id", row.id),
    supabase
      .from("development_project_sources")
      .select("*")
      .eq("project_id", row.id)
      .order("checked_at", { ascending: false }),
  ]);

  if (unitsResult.error) {
    throw new Error(`Failed to load unit types for "${slug}": ${unitsResult.error.message}`);
  }
  if (sourcesResult.error) {
    throw new Error(`Failed to load provenance for "${slug}": ${sourcesResult.error.message}`);
  }

  return buildDetail(
    row,
    (unitsResult.data ?? []) as DevelopmentUnitTypeRow[],
    (sourcesResult.data ?? []) as DevelopmentProjectSourceRow[],
  );
}
