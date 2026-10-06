"use client";

import { useCallback, useMemo } from "react";
import {
  CopilotChatMessageView,
  CopilotChatView,
  type CopilotChatMessageViewProps,
  type CopilotChatViewProps,
} from "@copilotkit/react-core/v2";
import {
  ConciergeTranscriptTail,
  useTranscriptTailHasContent,
} from "@/components/chat/concierge-transcript-tail";
import { sendConciergeUserMessage } from "@/lib/concierge-send-user-message";
import { useConciergeSendHandlers } from "@/lib/hooks/use-concierge-send-handlers";

/**
 * SAN-966 — the `messageView` slot: the stock CopilotKit message list, then the latest-turn
 * results. The tail is a sibling after the stock list, never passed through the list's `children`
 * render prop (that silently disables virtualization), so the stock list, its virtualization and
 * its scrolling are untouched. It sits outside the virtualizer's measured rows, in the
 * transcript's scroll content, so the composer always follows it.
 *
 * Keep this component module-level and stable: an inline component would remount the list.
 * `{...props}` forwards everything the slot receives, so `transformMessages` must stay unused
 * (the dedupe below reads the raw `messages`, not the list's transformed view of them).
 */
function ConciergeMessageViewInner(props: CopilotChatMessageViewProps) {
  // Only user and assistant messages are rendered by the stock list, so only their ids mean
  // "the transcript already shows this". The Set is keyed on the serialized id list so a streamed
  // token (a new `messages` array with the same ids) does not re-render the tail and its result
  // panels. JSON, not a separator join: an id that contains the separator cannot split in two.
  const shownIds = JSON.stringify(
    (props.messages ?? [])
      .filter((message) => message.role === "user" || message.role === "assistant")
      .map((message) => message.id),
  );
  const transcriptMessageIds = useMemo(() => new Set<string>(JSON.parse(shownIds)), [shownIds]);
  return (
    <>
      <CopilotChatMessageView {...props} />
      <ConciergeTranscriptTail transcriptMessageIds={transcriptMessageIds} />
    </>
  );
}

/** Carries the stock view's static members (e.g. `Cursor`), as the slot type requires. */
export const ConciergeMessageView = Object.assign(ConciergeMessageViewInner, CopilotChatMessageView);

/**
 * While the thread has no messages, CopilotKit shows its welcome screen and never mounts
 * `messageView`, which is where the results tail lives. Fast-path results and shortcut messages
 * do not need the AI runtime, so they can arrive while the thread is still empty (for example
 * when the runtime is down). Turn the welcome screen off whenever the tail has something to show;
 * otherwise leave CopilotKit's own choice alone.
 */
export function conciergeWelcomeScreen<T>(hasTailContent: boolean, welcomeScreen: T): T | false {
  return hasTailContent ? false : welcomeScreen;
}

/**
 * CopilotChat passes `onSubmitMessage` only once the agent is ready; without it the composer
 * cannot send. Supply our classify + fast-path handler only when CopilotKit supplied one, so that
 * readiness gate stays effective. An existing input object is preserved either way.
 */
export function conciergeInputSlot<T>(input: T, onSubmitMessage: ((text: string) => void) | undefined) {
  if (!onSubmitMessage) return input;
  return typeof input === "object" && input !== null && !("$$typeof" in input)
    ? { ...input, onSubmitMessage }
    : { onSubmitMessage };
}

/** Wrap CopilotChatView — route composer submit through classify + fast-path before agent fallback (CK-V2-015). */
function ConciergeChatViewInner(props: CopilotChatViewProps) {
  const handlers = useConciergeSendHandlers();
  const hasTailContent = useTranscriptTailHasContent();
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
        welcomeScreen={conciergeWelcomeScreen(hasTailContent, props.welcomeScreen)}
        input={conciergeInputSlot(props.input, props.onSubmitMessage ? onSubmitMessage : undefined)}
      />
    </div>
  );
}

/** CopilotChat view slot — classify + fast-path before agent (CK-V2-015). */
export const ConciergeChatView = Object.assign(
  ConciergeChatViewInner,
  CopilotChatView,
);
