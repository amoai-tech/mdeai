"use client";

import Link from "next/link";
import { Building2 } from "lucide-react";
import { BrowseLayout } from "@/components/browse/BrowseLayout";
import { EmptyState } from "@/components/empty/empty-state";
import { Button } from "@/components/ui/button";
import { ProjectBrowseFilters } from "@/components/new-projects/project-browse-filters";
import { ProjectCard } from "@/components/new-projects/project-card";
import { buildNewProjectsHref, hasActiveFilters } from "@/lib/new-projects/filters";
import type { NewProjectFilters, NewProjectSummary } from "@/lib/new-projects/types";

export type ProjectBrowseViewProps = {
  projects: NewProjectSummary[];
  total: number;
  error: string | null;
  filters: NewProjectFilters;
};

function countLabel(total: number, shown: number): string {
  const noun = total === 1 ? "published project" : "published projects";
  if (shown < total) return `${total} ${noun} (showing ${shown})`;
  return `${total} ${noun}`;
}

export function ProjectBrowseView({ projects, total, error, filters }: ProjectBrowseViewProps) {
  const retryHref = buildNewProjectsHref(filters);
  const filtered = hasActiveFilters(filters);

  return (
    <BrowseLayout
      testId="new-projects-browse"
      title="New projects in Medellín"
      subtitle={countLabel(total, projects.length) + " — every fact shows its source and verification date"}
      filterBar={<ProjectBrowseFilters filters={filters} />}
    >
      <section className="mt-6" aria-label="New-construction projects">
        {error ? (
          <div
            className="rounded-lg border border-destructive/30 bg-destructive/5 p-6 text-center"
            data-testid="new-projects-error"
          >
            <p className="text-sm text-destructive">{error}</p>
            <Button variant="outline" size="sm" className="mt-4" render={<Link href={retryHref} />}>
              Retry
            </Button>
          </div>
        ) : null}

        {!error && projects.length === 0 ? (
          <EmptyState
            testId="new-projects-empty"
            title={filtered ? "No projects matched those filters" : "No projects published yet"}
            description={
              filtered
                ? "Try another neighborhood, price or delivery option. Unknown facts are filtered out, not guessed."
                : "Verified Medellín new-construction projects will appear here as they are published."
            }
            icon={<Building2 className="size-8" aria-hidden />}
          />
        ) : null}

        {!error && projects.length > 0 ? (
          <div
            className="grid gap-4 sm:grid-cols-2"
            aria-label={projects.length + " new-construction projects"}
            data-testid="new-projects-grid"
          >
            {projects.map((project) => (
              <ProjectCard key={project.id} project={project} />
            ))}
          </div>
        ) : null}
      </section>
    </BrowseLayout>
  );
}
