import Link from "next/link";
import { safeNextPath } from "@/lib/auth/site-url";

/**
 * The sign-in prompt for a page that requires an account.
 *
 * Anonymous visitors previously saw only the sentence "Sign in as an admin…" with nothing to
 * click, so the page was a dead end. This reuses the existing /login route and its safe `next`
 * handling — no second login form, no second auth provider.
 */
type Props = {
  returnTo: string;
  title?: string;
  description?: string;
  buttonLabel?: string;
  testId?: string;
};

export function SignInRequired({
  returnTo,
  title = "Sign in required",
  description = "Sign in to continue.",
  buttonLabel = "Sign in",
  testId = "sign-in-required",
}: Props) {
  const next = safeNextPath(returnTo);

  return (
    <section data-testid={testId} className="rounded-lg border border-border/60 p-5">
      <h2 className="text-lg font-semibold">{title}</h2>
      <p className="mt-2 text-sm text-muted-foreground">{description}</p>
      <Link
        className="mt-4 inline-flex min-h-11 items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
        data-testid="sign-in-required-cta"
        href={"/login?next=" + encodeURIComponent(next)}
      >
        {buttonLabel}
      </Link>
    </section>
  );
}