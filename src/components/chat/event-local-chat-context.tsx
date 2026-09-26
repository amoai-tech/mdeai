"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useConciergeCoAgent } from "@/components/chat/concierge-coagent-context";

export type EventLocalChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  /** True for EVP-006 canned clarify assistant bubble. */
  isClarify?: boolean;
};

export type LocalClarifyKind = "event" | "rental" | "restaurant";

type EventLocalChatContextValue = {
  messages: EventLocalChatMessage[];
  /** True after canned clarify — merged into fast-path memory without CoAgent sync. */
  clarifyPending: boolean;
  clarifyKind: LocalClarifyKind | null;
  showClarify: (
    userText: string,
    assistantText: string,
    kind: LocalClarifyKind,
  ) => void;
  showExchange: (userText: string, assistantText: string) => void;
  clearLocalMessages: () => void;
};

const EventLocalChatContext = createContext<EventLocalChatContextValue | null>(
  null,
);

function nextId() {
  return `local-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function EventLocalChatProvider({ children }: { children: ReactNode }) {
  const { agent } = useConciergeCoAgent();
  const [messages, setMessages] = useState<EventLocalChatMessage[]>([]);
  const [clarifyPending, setClarifyPending] = useState(false);
  const [clarifyKind, setClarifyKind] = useState<LocalClarifyKind | null>(null);
  const pendingAgentMessagesRef = useRef<EventLocalChatMessage[]>([]);
  const agentRef = useRef(agent);

  useEffect(() => {
    agentRef.current = agent;
  }, [agent]);

  useEffect(() => {
    if (!agent || pendingAgentMessagesRef.current.length === 0) return;
    const pending = [...pendingAgentMessagesRef.current];
    try {
      agent.addMessages(pending);
      pendingAgentMessagesRef.current = [];
    } catch (error) {
      console.error(
        "[EventLocalChat] Failed to flush queued agent messages",
        error,
      );
    }
  }, [agent]);

  const publishOrQueue = useCallback(
    (nextMessages: EventLocalChatMessage[]) => {
      if (agentRef.current) {
        agentRef.current.addMessages(nextMessages);
        return;
      }
      pendingAgentMessagesRef.current.push(...nextMessages);
    },
    [],
  );

  const showClarify = useCallback(
    (userText: string, assistantText: string, kind: LocalClarifyKind) => {
      const nextMessages: EventLocalChatMessage[] = [
        { id: nextId(), role: "user", content: userText },
        {
          id: nextId(),
          role: "assistant",
          content: assistantText,
          isClarify: true,
        },
      ];
      setClarifyPending(true);
      setClarifyKind(kind);
      setMessages(nextMessages);
      publishOrQueue(nextMessages);
    },
    [publishOrQueue],
  );

  const showExchange = useCallback(
    (userText: string, assistantText: string) => {
      const nextMessages: EventLocalChatMessage[] = [
        { id: nextId(), role: "user", content: userText },
      ];
      if (assistantText.trim()) {
        nextMessages.push({
          id: nextId(),
          role: "assistant",
          content: assistantText,
        });
      }
      setClarifyPending(false);
      setClarifyKind(null);
      setMessages((prev) => [...prev, ...nextMessages]);
      publishOrQueue(nextMessages);
    },
    [publishOrQueue],
  );

  const clearLocalMessages = useCallback(() => {
    pendingAgentMessagesRef.current = [];
    setMessages([]);
    setClarifyPending(false);
    setClarifyKind(null);
  }, []);

  const value = useMemo(
    () => ({
      messages,
      clarifyPending,
      clarifyKind,
      showClarify,
      showExchange,
      clearLocalMessages,
    }),
    [
      messages,
      clarifyPending,
      clarifyKind,
      showClarify,
      showExchange,
      clearLocalMessages,
    ],
  );

  return (
    <EventLocalChatContext.Provider value={value}>
      {children}
    </EventLocalChatContext.Provider>
  );
}

export function useEventLocalChat() {
  const ctx = useContext(EventLocalChatContext);
  if (!ctx) {
    throw new Error("useEventLocalChat must be used within EventLocalChatProvider");
  }
  return ctx;
}
