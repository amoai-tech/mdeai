/** Mastra CLI only: `npm run dev:agent:builder`. Never import in Next.js. */
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { Mastra } from "@mastra/core/mastra";
import { MastraCompositeStore } from "@mastra/core/storage";
import { LibSQLStore } from "@mastra/libsql";
import { MastraEditor } from "@mastra/editor";
import { createBuilderAgent } from "@mastra/editor/ee";
import { createMastraConfig } from "../mastra/config";
import { isNextProductionBuild } from "../mastra/lib/storage";

// The Builder agent is EE-licensed; the vendor permits LOCAL DEVELOPMENT and
// TESTING without an EE production license. Never expose it in an app deployment.
if (process.env.MDE_MASTRA_AGENT_BUILDER !== "1" ||
    process.env.MASTRA_DEV !== "true" ||
    process.env.VERCEL === "1" || isNextProductionBuild()) {
  throw new Error("Local Builder requires explicit opt-in in mastra dev; prohibited in Next/Vercel.");
}

// The CLI can change process.cwd() during bundling. Accept PWD as launcher root,
// but verify the actual repo marker before using a persistent local database.
const projectRoot = process.env.PWD ?? process.cwd();
if (!existsSync(resolve(projectRoot, "src/mastra/index.ts"))) {
  throw new Error("Builder needs PWD pointing to the MDE project root; refuse to write outside it.");
}

const appConfig = createMastraConfig();
export const mastra = new Mastra({
  ...appConfig,
  agents: { ...appConfig.agents, builderAgent: createBuilderAgent() },
  storage: new MastraCompositeStore({
    id: "mde-builder-local-storage",
    default: appConfig.storage,
    editor: new LibSQLStore({
      id: "mde-builder-editor",
      // Separate ignored project-root DB survives CLI-generated `.mastra/` deletion.
      url: `file:${resolve(projectRoot, ".mde-builder.db")}`,
    }),
  }),
  // Local Studio's browser and API must share one origin.
  server: { host: "127.0.0.1", studioHost: "localhost" },
  editor: new MastraEditor({
    builder: {
      enabled: true,
      configuration: { agent: {
        tools: { allowed: [] },
        agents: { allowed: [] },
        workflows: { allowed: [] },
      } },
    },
  }),
});
