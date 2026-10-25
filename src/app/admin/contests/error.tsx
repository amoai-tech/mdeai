"use client";

/** SAN-1526 · a failed contest action shows a truthful error instead of a false "Saved". */
export default function AdminContestsError({ reset }: { error: Error; reset: () => void }) {
  return (
    <main className="mx-auto max-w-3xl px-4 py-10">
      <h1 className="text-xl font-semibold">That change did not save</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Nothing was written. Check the details and try again.
      </p>
      <button
        className="mt-4 min-h-11 rounded-md border border-border/60 px-4 text-sm"
        onClick={() => reset()}
        type="button"
      >
        Try again
      </button>
    </main>
  );
}