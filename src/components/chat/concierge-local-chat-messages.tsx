"use client";

import { useConciergeLocalChat } from "@/components/chat/use-concierge-local-chat";

/** Renders local fast-path messages (user + clarify/assistant) before CopilotKit history. */
export function ConciergeLocalChatMessages() {
  const { messages } = useConciergeLocalChat();

  if (!messages.length) return null;

  return (
    <div data-testid="concierge-local-chat-messages" className="flex flex-col gap-2">
      {messages.map((msg) => (
        <div
          key={msg.id}
          data-testid={msg.isClarify ? "local-clarify-message" : "local-user-message"}
          className={`flex gap-2 ${msg.role === "user" ? "justify-end" : "justify-start"}`}
        >
          <div
            className={`max-w-[70%] rounded-2xl px-4 py-2 text-sm ${
              msg.role === "user"
                ? "bg-primary text-primary-foreground rounded-br-none"
                : "bg-muted text-muted-foreground rounded-bl-none"
            }`}
          >
            {msg.content}
          </div>
        </div>
      ))}
    </div>
  );
}
