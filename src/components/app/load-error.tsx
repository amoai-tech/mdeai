import Link from "next/link";

type AccountLoadErrorProps = {
  message: string;
  retryHref: string;
  title?: string;
};

/**
 * A failed query is not an empty account. Render this instead of `0 saved` or
 * `No tickets yet`, and give the person a real retry.
 */
// skipcq: JS-0067 - shared server component
export function AccountLoadError({
  message,
  retryHref,
  title = "We couldn't load this right now",
}: AccountLoadErrorProps) {
  return (
    <div
      data-testid="personal-load-error"
      role="alert"
      className="rounded-xl border border-destructive/30 bg-destructive/10 p-6"
    >
      <p className="text-base font-semibold text-foreground">{title}</p>
      <p className="mt-2 text-sm text-muted-foreground">{message}</p>
      <Link
        href={retryHref}
        className="mt-4 inline-flex min-h-11 items-center text-sm font-semibold text-primary underline-offset-4 hover:underline"
      >
        Try again
      </Link>
    </div>
  );
}
