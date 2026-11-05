"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { setEventInterest } from "@/app/events/[slug]/actions";
import { Button, buttonVariants } from "@/components/ui/button";

type Props = { eventId: string; following: boolean; signedIn: boolean };

/**
 * Follow/unfollow an event with real persistence.
 *
 * A guest is sent to sign in and returned to this exact event; the follow is written
 * only after the visitor clicks, never silently on return. "Following" appears only
 * when the server confirmed a row.
 */
export function EventInterestButton({ eventId, following, signedIn }: Props) {
  // Guests get a plain link: no navigation hooks, so the button also renders in a
  // component test that mounts no router.
  if (!signedIn) return <SignInPrompt />;
  return <FollowControl eventId={eventId} following={following} />;
}

function SignInPrompt() {
  const path = usePathname();
  return (
    <Link
      href={`/login?next=${encodeURIComponent(path)}`}
      data-testid="event-follow-signin"
      className={buttonVariants({ variant: "outline" }) + " w-full"}
    >
      Sign in to follow updates
    </Link>
  );
}

function FollowControl({ eventId, following: initial }: { eventId: string; following: boolean }) {
  const [following, setFollowing] = useState(initial);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  const onClick = () => {
    setError(null);
    startTransition(async () => {
      const result = await setEventInterest(eventId, !following);
      if (!result.ok) {
        setError("We could not save that. Please try again.");
        return;
      }
      setFollowing(result.following);
      router.refresh();
    });
  };

  return (
    <div className="space-y-1">
      <Button
        type="button"
        variant={following ? "outline" : "default"}
        className="w-full"
        onClick={onClick}
        disabled={pending}
        aria-pressed={following}
        data-testid="event-follow"
      >
        {following ? "Following" : "Follow event updates"}
      </Button>
      {following ? (
        <p className="text-xs text-muted-foreground" data-testid="event-follow-note">
          We will tell you in the app when tickets for this event appear. Follow updates is not a ticket.
        </p>
      ) : null}
      {error ? (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}
