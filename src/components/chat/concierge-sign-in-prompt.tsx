"use client";

import Link from "next/link";
import { useEventLocalChat } from "@/components/chat/event-local-chat-context";
import { SIGN_IN_REQUIRED_MESSAGE } from "@/lib/concierge-sign-in-message";

/**
 * SAN-1507 — what a signed-out visitor sees after asking the AI concierge a free-form question.
 * The AI runtime refuses guests on purpose, so this is a sign-in offer, not a "try again" error.
 * `/login?next=%2Fchat` is the existing validated return path (`safeNextPath`).
 */
export function ConciergeSignInPrompt() {
  const { signInPrompt } = useEventLocalChat();
  if (!signInPrompt) return null;
  return (
    <div
      data-testid="concierge-sign-in-prompt"
      className="copilotKitMessage copilotKitAssistantMessage px-4 pb-3"
    >
      <div className="rounded-lg border border-border bg-muted/40 p-3 text-sm">
        <p className="font-medium">Sign in to ask the AI concierge</p>
        <p className="mt-0.5 text-muted-foreground">{SIGN_IN_REQUIRED_MESSAGE}</p>
        <Link
          href="/login?next=%2Fchat"
          data-testid="concierge-sign-in-link"
          className="mt-2 inline-flex font-medium text-primary hover:underline"
        >
          Sign in to continue
        </Link>
      </div>
    </div>
  );
}
