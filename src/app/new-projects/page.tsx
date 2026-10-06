import { ProjectBrowseView } from "@/components/new-projects/project-browse-view";
import { parseProjectFilters } from "@/lib/new-projects/filters";
import { listNewProjects } from "@/lib/new-projects/queries";
import type { NewProjectSummary } from "@/lib/new-projects/types";

export const dynamic = "force-dynamic";

interface Props {
  searchParams: Promise<{
    neighborhood?: string;
    maxPrice?: string;
    beds?: string;
    delivery?: string;
  }>;
}

/** SAN-1379 — public New Projects browse page. Works with no AI and no login. */
export default async function NewProjectsPage({ searchParams }: Props) {
  const params = await searchParams;
  const filters = parseProjectFilters(params);

  let projects: NewProjectSummary[] = [];
  let total = 0;
  let error: string | null = null;

  try {
    const result = await listNewProjects(filters);
    projects = result.projects;
    total = result.totalPublished;
  } catch (err) {
    error = "Could not load new projects right now. Please try again.";
    console.error("[/new-projects] listNewProjects failed:", (err as Error).message);
  }

  return <ProjectBrowseView projects={projects} total={total} error={error} filters={filters} />;
}
