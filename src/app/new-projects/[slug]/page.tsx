import Link from "next/link";
import { notFound } from "next/navigation";
import { ProjectDetailView } from "@/components/new-projects/project-detail-view";
import { getNewProjectBySlug } from "@/lib/new-projects/queries";
import type { NewProjectDetail } from "@/lib/new-projects/types";

export const dynamic = "force-dynamic";

interface Props {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: Props) {
  const { slug } = await params;
  try {
    const detail = await getNewProjectBySlug(slug);
    if (detail) {
      return {
        title: detail.name + " · New project · mdeai",
        description: "Verified new-construction project in " + (detail.neighborhood ?? "Medellín"),
      };
    }
  } catch {
    /* fall through to the default title */
  }
  return { title: "New project · mdeai" };
}

/** SAN-1379 — public project profile at /new-projects/[slug]. */
export default async function NewProjectDetailPage({ params }: Props) {
  const { slug } = await params;

  let detail: NewProjectDetail | null;
  try {
    detail = await getNewProjectBySlug(slug);
  } catch (err) {
    console.error("[/new-projects/[slug]] load failed:", (err as Error).message);
    return (
      <main
        data-testid="new-project-detail-error"
        className="mx-auto flex max-w-md flex-col items-center gap-3 px-4 py-24 text-center"
      >
        <h1 className="font-serif text-xl font-semibold">Couldn’t load this project</h1>
        <p className="text-sm text-muted-foreground">
          Something went wrong on our side. Please try again.
        </p>
        <Link href="/new-projects" className="text-sm text-primary hover:underline">
          Back to new projects
        </Link>
      </main>
    );
  }

  if (!detail) notFound();

  return <ProjectDetailView detail={detail} />;
}
