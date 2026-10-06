export default function NewProjectsLoading() {
  return (
    <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6" data-testid="new-projects-loading">
      <div className="h-8 w-64 animate-pulse rounded bg-muted" />
      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        {[0, 1, 2, 3].map((key) => (
          <div key={key} className="h-72 animate-pulse rounded-xl bg-muted" />
        ))}
      </div>
    </main>
  );
}
