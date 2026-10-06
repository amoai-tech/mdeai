import Link from "next/link";

export default function NewProjectNotFound() {
  return (
    <main
      data-testid="new-project-not-found"
      className="mx-auto flex max-w-md flex-col items-center gap-3 px-4 py-24 text-center"
    >
      <h1 className="font-serif text-xl font-semibold">Project not found</h1>
      <p className="text-sm text-muted-foreground">
        This project is not published, or the link is out of date.
      </p>
      <Link href="/new-projects" className="text-sm text-primary hover:underline">
        Browse new projects
      </Link>
    </main>
  );
}
