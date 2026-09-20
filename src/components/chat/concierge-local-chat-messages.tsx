"use client";

import { useEventLocalChat } from "@/components/chat/event-local-chat-context";
import { RestaurantFilterChips } from "@/components/chat/restaurant-filter-chips";
import { sanitizeAssistantChatContent } from "@/lib/sanitize-assistant-chat-content";

/** Render local fast-path exchanges that do not belong to the CopilotKit thread. */
export function ConciergeLocalChatMessages() {
  const { messages, clarifyKind } = useEventLocalChat();

  if (messages.length === 0) return null;

  return (
    <div
      data-testid="concierge-local-messages"
      className="space-y-3 px-4 pb-3"
      aria-live="polite"
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
              {assistant}
              {clarifyKind === "restaurant" ? <RestaurantFilterChips /> : null}
            </div>
          );
        }

        return <div key={message.id}>{assistant}</div>;
      })}
    </div>
  );
}
