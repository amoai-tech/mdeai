export type CopilotRequest = { agentId?: string; threadId?: string; body: unknown };

export function resolveCopilotAgent(request: CopilotRequest) {
  return {
    agent: request.agentId ?? "default",
    thread: request.threadId ?? "shared",
    body: request.body,
  };
}
