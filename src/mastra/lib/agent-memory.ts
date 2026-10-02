import { createTool } from "@mastra/core/tools";
import { Memory } from "@mastra/memory";
import { z, type ZodObject, type ZodRawShape, type ZodTypeAny } from "zod";
import { getMastraStorage } from "./storage";

type MemoryConfig = ConstructorParameters<typeof Memory>[0];

/**
 * SAN-1387 — a Memory whose `updateWorkingMemory` tool validates the model's args
 * with `memoryInput` instead of the bare schema. The pinned tool builds its input
 * from the schema itself, so a blank Gemini placeholder would reject the whole
 * update. Only the tool's input changes; the stored schema and the model-facing
 * JSON schema stay the same. Remove once the Mastra upgrade (SAN-1338) covers it.
 */
class PlaceholderTolerantMemory extends Memory {
  constructor(
    config: MemoryConfig,
    private readonly memoryInput: ZodTypeAny,
  ) {
    super(config);
  }

  override listTools(...args: Parameters<Memory["listTools"]>) {
    const tools = super.listTools(...args);
    const original = tools.updateWorkingMemory;
    if (!original) return tools;
    return {
      ...tools,
      updateWorkingMemory: createTool({
        id: original.id,
        description: original.description,
        inputSchema: z.object({ memory: this.memoryInput }),
        execute: original.execute,
      } as Parameters<typeof createTool>[0]),
    } as ReturnType<Memory["listTools"]>;
  }
}

export function createThreadMemory<T extends ZodRawShape>(
  schema: ZodObject<T>,
  // PERF-002: lastMessages is the largest input-token driver on busy threads —
  // replayed tool-result payloads inflate every Gemini call. Callers that don't
  // need deep raw history pass a smaller window to cut input size (and latency)
  // without losing follow-up context, which lives in working memory. Default 20.
  // memoryInput: what `updateWorkingMemory` accepts from the model (see above).
  options?: { lastMessages?: number; memoryInput?: ZodTypeAny },
) {
  const config: MemoryConfig = {
    storage: getMastraStorage(),
    options: {
      workingMemory: {
        enabled: true,
        scope: "thread",
        schema,
      },
      lastMessages: options?.lastMessages ?? 20,
    },
  };
  return options?.memoryInput
    ? new PlaceholderTolerantMemory(config, options.memoryInput)
    : new Memory(config);
}

/** Host wizard draft lives in CopilotKit state — read-only WM avoids updateWorkingMemory tool ([SAN-905 · CK-V2-007d — Console clean on hostEventAgent stream](https://linear.app/sanjiovani/issue/SAN-905/ck-v2-007d-console-clean-on-hosteventagent-stream)). */
export function createHostEventThreadMemory<T extends ZodRawShape>(schema: ZodObject<T>) {
  return new Memory({
    storage: getMastraStorage(),
    options: {
      readOnly: true,
      workingMemory: {
        enabled: true,
        scope: "thread",
        schema,
      },
      lastMessages: 20,
    },
  });
}
