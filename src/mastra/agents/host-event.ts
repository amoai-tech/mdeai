import { Agent } from "@mastra/core/agent";
import { EventDraftStateSchema } from "../../lib/types/event-draft";
import { createHostEventThreadMemory } from "../lib/agent-memory";
import { ACTIVE_TEXT_MODEL } from "../lib/models";
import { geminiMalformedFirstStepRetry } from "../lib/gemini-malformed-retry";
import { HOST_EVENT_INSTRUCTIONS } from "./host-event-prompt";

export const hostEventAgent = new Agent({
  id: "host-event-agent",
  name: "Host Event Agent",
  tools: {},
  workspace: () => undefined, // SAN-903 · opt out of global filesystem tools
  model: ACTIVE_TEXT_MODEL,
  // SAN-1396: same bounded first-step recovery as the concierge (never after a tool ran).
  errorProcessors: [geminiMalformedFirstStepRetry],
  // One carefully scoped first-step correction, not up to three implicit replays (same as the concierge).
  maxProcessorRetries: 1,
  instructions: HOST_EVENT_INSTRUCTIONS,
  memory: createHostEventThreadMemory(EventDraftStateSchema),
});
