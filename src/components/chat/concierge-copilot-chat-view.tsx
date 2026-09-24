"use client";

import { useCallback, type ComponentProps } from "react";
import {
  CopilotChatView,
  type CopilotChatViewProps,
} from "@copilotkit/react-core/v2";
import { sendConciergeUserMessage } from "@/lib/concierge-send-user-message";
import { useConciergeSendHandlers } from "@/lib/hooks/use-concierge-send-handlers";
import { ConciergeLocalChatMessages } from "@/components/chat/concierge-local-chat-messages";
import { useConciergeLocalChat } from "@/components/chat/use-concierge-local-chat";

function ConciergeScrollView(
  props: ComponentProps<typeof CopilotChatView.ScrollView>,
) {
  const { children, ...rest } = props;
  return (
    <CopilotChatView.ScrollView {...rest}>
      <div className="cpk:max-w-3xl cpk:mx-auto">
        <ConciergeLocalChatMessages />
      </div>
      {children}
    </CopilotChatView.ScrollView>
  );
}

/** Wrap CopilotChatView — route composer submit through classify + fast-path before agent fallback (CK-V2-015). */
function ConciergeChatViewInner(props: CopilotChatViewProps) {
  const handlers = useConciergeSendHandlers();
  const { messages: localMessages } = useConciergeLocalChat();
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
        scrollView={ConciergeScrollView}
        welcomeScreen={localMessages.length > 0 ? false : props.welcomeScreen}
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
