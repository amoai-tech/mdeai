import Link from "next/link";

/**
 * "Clear filters" for a browse page.
 *
 * The caller owns the URL (each page builds its own filter params), so this only fixes the label,
 * the semantics and the look. Kept as one component because four pages were otherwise going to
 * repeat the same link, and an id/test id per page keeps the specs readable.
 */
export function ClearFiltersLink({
  href,
  testId,
  className,
}: {
  href: string;
  testId: string;
  className?: string;
}) {
  return (
    <Link
      href={href}
      data-testid={testId}
      className={className ?? "text-sm text-primary underline-offset-4 hover:underline"}
    >
      Clear filters
    </Link>
  );
}
