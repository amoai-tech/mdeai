"use client";

import Link from "next/link";
import { useHydrated } from "@/hooks/use-hydrated";
import { useSession } from "@/hooks/use-session";
import { SignOutButton } from "@/components/auth/sign-out-button";

export function AuthStatus() {
  const hydrated = useHydrated();
  const { user, loading } = useSession();

  if (!hydrated || loading) {
    return (
      <p className="text-xs text-muted-foreground" aria-live="polite">
        Checking session…
      </p>
    );
  }

  if (!user) {
    return (
      <div className="flex shrink-0 items-center gap-1 whitespace-nowrap text-xs text-muted-foreground">
        <Link
          href="/login"
          className="inline-flex min-h-11 items-center px-1 -mx-1 text-primary underline-offset-4 hover:underline lg:min-h-0"
        >
          Sign in
        </Link>
        <span aria-hidden>·</span>
        <Link
          href="/signup"
          className="inline-flex min-h-11 items-center px-1 -mx-1 text-primary underline-offset-4 hover:underline lg:min-h-0"
        >
          Sign up
        </Link>
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
      <span className="font-mono truncate max-w-[14rem]">{user.email}</span>
      <SignOutButton />
    </div>
  );
}
