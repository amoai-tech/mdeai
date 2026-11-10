import { Mastra } from "@mastra/core/mastra";
import { createMastraConfig } from "./config";

/** Customer runtime never imports the dev-only Studio Editor or Builder. */
export const mastra = new Mastra(createMastraConfig());
