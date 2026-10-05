import { Agent } from "@mastra/core/agent";
import { Memory } from "@mastra/memory";
import { z } from "zod";
import { FLASH_MODEL } from "../lib/models";
import { getMastraStorage } from "../lib/storage";

export { routerAgent } from "./router";
export { rentalAgent } from "./rental-agent";
export { conciergeAgent } from "./concierge";
export { eventAgent } from "./event-agent";
export { evaluationAgent } from "./evaluation";
export { hostEventAgent } from "./host-event";
export { hostOpsAgent } from "./host-ops";

export const MdeState = z.object({
  lastQuery: z.string().default(""),
  hint: z.string().default(""),
});

export const pingAgent = new Agent({
  id: "ping-agent",
  name: "Ping Agent",
  tools: {},
  model: FLASH_MODEL,
  instructions:
    "You are mdeai's day-1 ping agent. Respond briefly in the same language the user wrote in. Confirm the wiring is alive. Do not call any tools.",
  memory: new Memory({
    storage: getMastraStorage(),
    options: {
      workingMemory: {
        enabled: true,
        schema: MdeState,
        scope: "thread",
      },
    },
  }),
});
