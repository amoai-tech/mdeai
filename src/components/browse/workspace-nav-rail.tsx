"use client";

import Link from "next/link";
import { MessageSquare, Sparkles } from "lucide-react";
import { ExploreLibraryNav } from "@/components/chat/chat-nav-rail";

/**
 * Side menu for discovery pages that have no chat session (SAN-1421).
 *
 * `ChatNavRail` needs the concierge session to start a new chat and to switch saved chats, and that
 * session only exists on /chat. Here the menu keeps to what works without it: the same Explore and
 * Library links, plus one link into the real chat. Saved chats and "New chat" come with the shared
 * per-tab conversation (SAN-1088 · Make Chat Navigation Simple and Keep the Right Conversation Selected).
 */
export function WorkspaceNavRail({
  activeSlug,
  testId = "workspace-nav-rail",
}: {
  activeSlug: string;
  testId?: string;
}) {
  return (
    <nav
      data-testid={testId}
      aria-label="Site navigation"
      className="flex h-full min-h-0 flex-col gap-4"
    >
      <Link
        href="/"
        className="flex items-center gap-2 px-3 text-sm font-semibold"
        data-testid="workspace-nav-brand"
      >
        <Sparkles className="size-4 text-primary" aria-hidden />
        mdeai
      </Link>
      <ul className="flex shrink-0 flex-col gap-1 text-sm">
        <li>
          <Link
            href="/chat"
            data-testid="workspace-nav-open-chat"
            className="inline-flex h-8 w-full items-center justify-start gap-2 rounded-lg bg-secondary px-3 text-sm font-medium text-secondary-foreground hover:bg-secondary/80"
          >
            <MessageSquare className="size-4 shrink-0" aria-hidden />
            Ask MDE in chat
          </Link>
        </li>
      </ul>
      <ExploreLibraryNav activeSlug={activeSlug} />
    </nav>
  );
}
