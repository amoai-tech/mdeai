"use client";

import { useEventLocalChat } from "@/components/chat/event-local-chat-context";
import { RestaurantFilterChips } from "@/components/chat/restaurant-filter-chips";
import { sanitizeAssistantChatContent } from "@/lib/sanitize-assistant-chat-content";

/**
 * Render local fast-path exchanges. Each exchange is also published (or queued until the agent
 * exists) into the CopilotKit thread with the same ids, so `excludeIds` (the ids the transcript
 * already shows) hides what is already on screen. Without `excludeIds` (the deterministic test
 * chat, which has no transcript) every local message shows.
 *
 * Only a restaurant clarifying question is kept when the transcript already has it: the transcript
 * shows its text, but only this component can show its filter chips, so only the chips remain.
 * The user's own bubble of that exchange is still hidden. Event and rental clarifies have no chips,
 * so nothing is left to show.
 */
export function ConciergeLocalChatMessages({
  excludeIds,
}: {
  excludeIds?: ReadonlySet<string>;
}) {
  const { messages: allMessages, clarifyKind } = useEventLocalChat();
  const shownByTranscript = (id: string) => excludeIds?.has(id) ?? false;
  const messages = allMessages.filter(
    (message) =>
      !shownByTranscript(message.id) || (message.isClarify && clarifyKind === "restaurant"),
  );

  if (messages.length === 0) return null;

  return (
    <div
      data-testid="concierge-local-messages"
      className="space-y-3 px-4 pb-3"
    >
      {messages.map((message) => {
        if (message.role === "user") {
          return (
            <div
              key={message.id}
              data-testid="concierge-user-message"
              className="ml-auto max-w-[85%] rounded-2xl bg-primary px-3 py-2 text-sm text-primary-foreground"
            >
              <p>{message.content}</p>
            </div>
          );
        }

        const assistantText = sanitizeAssistantChatContent(message.content);
        const assistant = (
          <div className="max-w-[90%] rounded-2xl bg-muted px-3 py-2 text-sm text-foreground">
            {assistantText ? (
              <p className="whitespace-pre-wrap">{assistantText}</p>
            ) : null}
          </div>
        );

        if (message.isClarify) {
          const testId =
            clarifyKind === "restaurant"
              ? "restaurant-clarify"
              : "event-clarify";
          return (
            <div key={message.id} data-testid={testId}>
              {shownByTranscript(message.id) ? null : assistant}
              {clarifyKind === "restaurant" ? <RestaurantFilterChips /> : null}
            </div>
          );
        }

        return <div key={message.id}>{assistant}</div>;
      })}
    </div>
  );
}
