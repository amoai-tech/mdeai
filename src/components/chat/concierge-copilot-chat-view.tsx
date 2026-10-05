"use client";

import { useCallback, useMemo } from "react";
import {
  CopilotChatMessageView,
  CopilotChatView,
  type CopilotChatMessageViewProps,
  type CopilotChatViewProps,
} from "@copilotkit/react-core/v2";
import { ConciergeTranscriptTail } from "@/components/chat/concierge-transcript-tail";
import { sendConciergeUserMessage } from "@/lib/concierge-send-user-message";
import { useConciergeSendHandlers } from "@/lib/hooks/use-concierge-send-handlers";

/**
 * SAN-966 — the `messageView` slot: the stock CopilotKit message list, then the latest-turn
 * results. Rendering the tail as a sibling (not through the message view's `children` render
 * prop) keeps the stock list, its virtualization and its scrolling exactly as shipped, and
 * places the results inside the transcript so the composer always follows them.
 */
function ConciergeMessageViewInner(props: CopilotChatMessageViewProps) {
  const transcriptMessageIds = useMemo(
    () => new Set((props.messages ?? []).map((message) => message.id)),
    [props.messages],
  );
  return (
    <>
      <CopilotChatMessageView {...props} />
      <ConciergeTranscriptTail transcriptMessageIds={transcriptMessageIds} />
    </>
  );
}

/** Carries the stock view's static members (e.g. `Cursor`), as the slot type requires. */
export const ConciergeMessageView = Object.assign(ConciergeMessageViewInner, CopilotChatMessageView);

/** Wrap CopilotChatView — route composer submit through classify + fast-path before agent fallback (CK-V2-015). */
function ConciergeChatViewInner(props: CopilotChatViewProps) {
  const handlers = useConciergeSendHandlers();
  const onSubmitMessage = useCallback(
    (text: string) => {
      void sendConciergeUserMessage(text, handlers);
    },
    [handlers],
  );
  return (
    <div data-testid="concierge-chat-view-mounted" className="contents">
      <CopilotChatView
        {...props}
        messageView={ConciergeMessageView}
        input={
          typeof props.input === "object" &&
          props.input !== null &&
          !("$$typeof" in props.input)
            ? { ...props.input, onSubmitMessage }
            : { onSubmitMessage }
        }
      />
    </div>
  );
}

/** CopilotChat view slot — classify + fast-path before agent (CK-V2-015). */
export const ConciergeChatView = Object.assign(
  ConciergeChatViewInner,
  CopilotChatView,
);
