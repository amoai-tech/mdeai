"use client";

import { Button } from "@/components/ui/button";

type SignOutButtonProps = {
  /** Optional sizing class for the host chrome; the action never changes. */
  className?: string;
};

export function SignOutButton({ className }: SignOutButtonProps = {}) {
  return (
    <form action="/auth/signout" method="post">
      <Button type="submit" variant="outline" size="sm" className={className}>
        Sign out
      </Button>
    </form>
  );
}
