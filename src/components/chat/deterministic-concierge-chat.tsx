"use client";

import { useState } from "react";
import { sendConciergeUserMessage } from "@/lib/concierge-send-user-message";
import { useHydrated } from "@/hooks/use-hydrated";
import { useConciergeSendHandlers } from "@/lib/hooks/use-concierge-send-handlers";

/** Test-only chat surface: real MDE router/fast paths, no CopilotKit agent transport. */
export function DeterministicConciergeChat() {
  const handlers = useConciergeSendHandlers();
  const hydrated = useHydrated();
  const [value, setValue] = useState("");
  const [sending, setSending] = useState(false);

  async function submit() {
    const text = value.trim();
    if (!text || sending) return;
    setSending(true);
    try {
      const handled = await sendConciergeUserMessage(text, handlers);
      if (handled) setValue("");
    } finally {
      setSending(false);
    }
  }

  return (
    <div
      data-testid="concierge-chat-view-mounted"
      data-hydrated={hydrated ? "true" : "false"}
      className="flex min-h-0 flex-1 flex-col justify-end"
    >
      <div className="mx-auto w-full max-w-3xl px-4 pb-4">
        <div
          data-testid="copilot-chat-input"
          className="flex items-end gap-2 rounded-3xl border border-border bg-background p-2 shadow-sm"
        >
          <textarea
            data-testid="copilot-chat-textarea"
            aria-label="Type a message"
            placeholder="Type a message..."
            value={value}
            onChange={(event) => setValue(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                void submit();
              }
            }}
            className="min-h-12 flex-1 resize-none bg-transparent px-3 py-2 outline-none"
          />
          <button
            type="button"
            data-testid="copilot-send-button"
            aria-label="Send"
            disabled={!hydrated || !value.trim() || sending}
            onClick={() => void submit()}
            className="rounded-full bg-primary px-4 py-2 text-primary-foreground disabled:opacity-50"
          >
            {sending ? "Sending…" : "Send"}
          </button>
        </div>
      </div>
    </div>
  );
}
