"use client";

import { useCallback, useEffect, useMemo } from "react";
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
import { useHydrated } from "@/hooks/use-hydrated";
import { useSession } from "@/hooks/use-session";
import { takeConciergeDraft } from "@/lib/concierge-draft-store";
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

/** Props for the composer: our submit handler wired unconditionally, and the textarea locked until the page is live. */
export function conciergeComposerInput(
  baseInput: CopilotChatViewProps["input"],
  onSubmitMessage: (text: string) => void,
  hydrated: boolean,
): CopilotChatViewProps["input"] {
  const inputProps =
    typeof baseInput === "object" && baseInput !== null && !("$$typeof" in baseInput)
      ? (baseInput as Record<string, unknown>)
      : {};
  const textAreaProps =
    typeof inputProps.textArea === "object" &&
    inputProps.textArea !== null &&
    !("$$typeof" in inputProps.textArea)
      ? (inputProps.textArea as Record<string, unknown>)
      : {};

  return {
    ...inputProps,
    onSubmitMessage,
    textArea: {
      ...textAreaProps,
      enterKeyHint: "send",
      inputMode: "text",
      // A caller that disables the composer for its own reasons keeps it disabled.
      disabled: textAreaProps.disabled === true || !hydrated,
    },
  } as CopilotChatViewProps["input"];
}

/**
 * Wrap CopilotChatView — route composer submit through classify + fast-path before agent fallback (CK-V2-015).
 *
 * Our send handler is wired UNCONDITIONALLY. CopilotChat passes no `onSubmitMessage` while the AI
 * runtime is unreachable (agent not ready), and without one the send button is disabled, so a renter
 * could not even ask for rentals that the fast-path answers without the agent.
 */
function ConciergeChatViewInner(props: CopilotChatViewProps) {
  const handlers = useConciergeSendHandlers();
  const hasTailContent = useTranscriptTailHasContent();
  const onSubmitMessage = useCallback(
    (text: string) => {
      void sendConciergeUserMessage(text, handlers);
    },
    [handlers],
  );
  // The composer is server-rendered, so it shows up before the page's JavaScript can act on it.
  // Typing or pressing Enter in that gap does nothing and the typed text is wiped when the page
  // finishes loading — a renter's first message was silently lost. Keep it disabled until the
  // client has taken over.
  const hydrated = useHydrated();
  const input = useMemo(
    () => conciergeComposerInput(props.input, onSubmitMessage, hydrated),
    [onSubmitMessage, props.input, hydrated],
  );
  // SAN-1507: a visitor who asked the AI while signed out and then signed in gets that question back
  // in the composer, editable and NOT sent. CopilotChat already owns the composer text and passes
  // its setter down, so the normal typing path is untouched. The draft is read once, and only once
  // there is a signed-in user, so going back from /login without signing in keeps it.
  const { user } = useSession();
  const setComposerText = props.onInputChange;
  useEffect(() => {
    if (!user) return;
    const draft = takeConciergeDraft();
    if (draft) setComposerText?.(draft);
  }, [user, setComposerText]);

  return (
    <div data-testid="concierge-chat-view-mounted" className="contents">
      <CopilotChatView
        {...props}
        messageView={ConciergeMessageView}
        welcomeScreen={conciergeWelcomeScreen(hasTailContent, props.welcomeScreen)}
        input={input}
      />
    </div>
  );
}

/** CopilotChat view slot — classify + fast-path before agent (CK-V2-015). */
export const ConciergeChatView = Object.assign(
  ConciergeChatViewInner,
  CopilotChatView,
);
