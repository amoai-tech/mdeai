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
  /** An assistant-only line, for when the renter's own message is already in the transcript. */
  showNotice: (assistantText: string) => void;
  /** SAN-1507: true after a signed-out visitor asked the AI; the transcript then offers sign-in. */
  signInPrompt: boolean;
  /** Keep the visitor's question in the transcript and offer sign-in. No agent run is started. */
  showSignInPrompt: (userText: string) => void;
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
  const [signInPrompt, setSignInPrompt] = useState(false);
  const pendingAgentMessagesRef = useRef<EventLocalChatMessage[]>([]);
  const pendingSavesRef = useRef<EventLocalChatMessage[][]>([]);
  // Declared as a ref because the flush effect runs above the callbacks that implement saving.
  const saveRef = useRef<(threadId: string, batch: EventLocalChatMessage[]) => void>(() => {});
  const agentRef = useRef(agent);

  useEffect(() => {
    agentRef.current = agent;
  }, [agent]);

  useEffect(() => {
    if (!agent?.threadId || pendingSavesRef.current.length === 0) return;
    const queued = [...pendingSavesRef.current];
    pendingSavesRef.current = [];
    for (const batch of queued) saveRef.current(agent.threadId, batch);
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

  /**
   * SAN-1531 — the local exchange must outlive the tab.
   *
   * `agent.addMessages()` only changes the browser session; nothing reaches Mastra storage until a
   * real agent run happens. The discovery fast paths never start a run, so the answer disappeared
   * after a refresh. Persist the same exchange through the existing thread route (same tables, same
   * owner check) and stay silent on 401: a guest has no thread to save to.
   */
  const save = useCallback((threadId: string, batch: EventLocalChatMessage[]) => {
    const messages = batch
      .filter((m) => m.role === "user" || m.role === "assistant")
      .map(({ id, role, content }) => ({ id, role, content }));
    if (messages.length === 0) return;
    void fetch(`/api/threads/${encodeURIComponent(threadId)}/messages`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ messages }),
      keepalive: true,
    })
      .then((response) => {
        if (!response.ok && response.status !== 401) {
          console.warn(`[EventLocalChat] history save failed: ${response.status}`);
        }
      })
      .catch((error) => console.warn("[EventLocalChat] history save failed", error));
  }, []);

  useEffect(() => {
    saveRef.current = save;
  }, [save]);

  const persist = useCallback(
    (batch: EventLocalChatMessage[]) => {
      const threadId = agentRef.current?.threadId;
      // The first fast-path answer can arrive before CopilotKit assigns a thread id. Keep the batch
      // and save it as soon as the id exists, instead of dropping the answer.
      if (!threadId) {
        pendingSavesRef.current.push(batch);
        return;
      }
      save(threadId, batch);
    },
    [save],
  );

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

  /**
   * Publishing to the agent is a browser-session concern. A synchronous failure there (hydration
   * race, broken socket) must not abort the exchange the person is already looking at, and must not
   * skip its durable save.
   */
  const publishSafely = useCallback(
    (batch: EventLocalChatMessage[]) => {
      try {
        publishOrQueue(batch);
      } catch (error) {
        console.warn("[EventLocalChat] publishing to the agent failed", error);
      }
    },
    [publishOrQueue],
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
      setSignInPrompt(false);
      setMessages(nextMessages);
      publishSafely(nextMessages);
      persist(nextMessages);
    },
    [persist, publishSafely],
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
      setSignInPrompt(false);
      setMessages((prev) => [...prev, ...nextMessages]);
      publishSafely(nextMessages);
      persist(nextMessages);
    },
    [persist, publishSafely],
  );

  const showNotice = useCallback(
    (assistantText: string) => {
      const next: EventLocalChatMessage[] = [
        { id: nextId(), role: "assistant", content: assistantText },
      ];
      setSignInPrompt(false);
      setMessages((prev) => [...prev, ...next]);
      publishSafely(next);
      persist(next);
    },
    [persist, publishSafely],
  );

  const showSignInPrompt = useCallback((userText: string) => {
    // This is a guest-only display message, not part of an authenticated AG-UI thread.
    // Do not call showExchange: it publishes/queues messages into the CopilotKit agent,
    // which could later be attached to a signed-in user's thread.
    setClarifyPending(false);
    setClarifyKind(null);
    setMessages((prev) => [...prev, { id: nextId(), role: "user", content: userText }]);
    setSignInPrompt(true);
  }, []);

  const clearLocalMessages = useCallback(() => {
    pendingAgentMessagesRef.current = [];
    setSignInPrompt(false);
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
      showNotice,
      signInPrompt,
      showSignInPrompt,
      clearLocalMessages,
    }),
    [
      messages,
      clarifyPending,
      clarifyKind,
      showClarify,
      showExchange,
      showNotice,
      signInPrompt,
      showSignInPrompt,
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
