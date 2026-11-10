import { Mastra } from "@mastra/core/mastra";
import { MastraCompositeStore } from "@mastra/core/storage";
import { LibSQLStore } from "@mastra/libsql";
import { resolve } from "node:path";
import { ConsoleLogger, LogLevel } from "@mastra/core/logger";
import { MastraEditor } from "@mastra/editor";
import { createBuilderAgent } from "@mastra/editor/ee";
import { getMastraStorage, isNextProductionBuild } from "./lib/storage";
import {
  pingAgent,
  routerAgent,
  rentalAgent,
  conciergeAgent,
  eventAgent,
  evaluationAgent,
  hostEventAgent,
  hostOpsAgent,
  partnerAgent,
} from "./agents";
import {
  rentalSearchWorkflow,
  eventDiscoveryWorkflow,
  eventVenueBookingWorkflow,
  salesInsightWorkflow,
} from "./workflows";
import { getRuntimeWorkspace } from "./workspaces";
import { scorers } from "./scorers";

const LOG_LEVEL = (process.env.LOG_LEVEL as LogLevel) || "info";

// Studio-only opt-in. Never initialize unauthenticated Editor/Builder in
// Next.js build workers or customer API routes, even when a shared .env sets
// MDE_MASTRA_AGENT_BUILDER=1. Mastra CLI sets MASTRA_DEV=true for `mastra dev`.
const enableLocalBuilder =
  process.env.MDE_MASTRA_AGENT_BUILDER === "1" &&
  process.env.MASTRA_DEV === "true" &&
  process.env.VERCEL !== "1" &&
  !isNextProductionBuild();

export const mastra = new Mastra({
  agents: {
    pingAgent,
    routerAgent,
    rentalAgent,
    conciergeAgent,
    eventAgent,
    evaluationAgent,
    hostEventAgent,
    hostOpsAgent,
    partnerAgent,
  },
  workflows: {
    rentalSearchWorkflow,
    eventDiscoveryWorkflow,
    eventVenueBookingWorkflow,
    salesInsightWorkflow,
  },
  workspace: getRuntimeWorkspace(),
  scorers,
  // Keep the canonical MDE runtime storage; persist only local Builder drafts
  // to an ignored file so they survive dev-server rebuilds without touching
  // production Supabase tables or changing Concierge/booking memory.
  storage: enableLocalBuilder
    ? new MastraCompositeStore({
        id: "mde-builder-local-storage",
        default: getMastraStorage(),
        editor: new LibSQLStore({
          id: "mde-builder-editor",
          // Mastra dev changes cwd; PWD remains the project launcher directory.
          url: `file:${resolve(process.env.PWD ?? process.cwd(), ".mastra", "editor.db")}`,
        }),
      })
    : getMastraStorage(),
  // Keep the Builder loopback-only. Studio opens at localhost, so advertise
  // localhost for its API instead of cross-origin 127.0.0.1 (CORS failure).
  ...(enableLocalBuilder
    ? { server: { host: "127.0.0.1", studioHost: "localhost" } }
    : {}),
  ...(enableLocalBuilder
    ? {
        editor: new MastraEditor({
          builder: {
            enabled: true,
            // Start read-only: opt into specific validated tools only after
            // verifying Builder auth and per-user context isolation.
            configuration: {
              agent: {
                tools: { allowed: [] },
                agents: { allowed: [] },
                workflows: { allowed: [] },
              },
            },
          },
        }),
      }
    : {}),
  logger: new ConsoleLogger({
    level: LOG_LEVEL,
  }),
});

// Keep the product-agent registry's static type and production roster unchanged.
if (enableLocalBuilder) {
  mastra.addAgent(createBuilderAgent(), "builderAgent");
}
