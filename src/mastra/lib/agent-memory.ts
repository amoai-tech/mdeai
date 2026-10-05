import { createTool } from "@mastra/core/tools";
import { Memory } from "@mastra/memory";
import { z, type ZodObject, type ZodRawShape, type ZodTypeAny } from "zod";
import { getMastraStorage } from "./storage";

type MemoryConfig = ConstructorParameters<typeof Memory>[0];

type PlainObject = Record<string, unknown>;
const isPlainObject = (value: unknown): value is PlainObject =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/**
 * SAN-1387 + SAN-1338 — MDE's working-memory boundary.
 *
 * MDE accepts the model's args with `memoryInput` so a blank Gemini placeholder is
 * dropped instead of rejecting the whole update (the native tool would reject it).
 *
 * The upgraded native `updateWorkingMemory` also strips null optional fields before
 * its merge, which silently removes MDE's deliberate `mapUi.selectedPinId: null` =
 * "no pin selected". Keep the MDE input schema and clear the pin through the public
 * Memory API for that one case; every other update still goes through the native tool.
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
    const originalExecute = original.execute as (
      input: unknown,
      context: unknown,
    ) => Promise<unknown>;
    return {
      ...tools,
      updateWorkingMemory: createTool({
        id: original.id,
        description: original.description,
        inputSchema: z.object({ memory: this.memoryInput }),
        execute: async (inputData, context) => {
          const patch = (inputData as { memory?: unknown }).memory;
          const clearSelectedPin =
            isPlainObject(patch) &&
            isPlainObject(patch.mapUi) &&
            Object.prototype.hasOwnProperty.call(patch.mapUi, "selectedPinId") &&
            patch.mapUi.selectedPinId === null;

          if (!clearSelectedPin) {
            return originalExecute(inputData, context);
          }

          // Drop the null before the native merge (it would strip it anyway), let the
          // native tool ensure the thread and apply any other fields, then clear the
          // pin with the public Memory API.
          const rest: PlainObject = { ...patch };
          const mapUi = { ...(patch.mapUi as PlainObject) };
          delete mapUi.selectedPinId;
          if (Object.keys(mapUi).length > 0) rest.mapUi = mapUi;
          else delete rest.mapUi;

          const nativeResult = await originalExecute(
            { memory: Object.keys(rest).length > 0 ? rest : undefined },
            context,
          );

          const ctx = context as {
            memory?: {
              getWorkingMemory: (a: {
                threadId?: string;
                resourceId?: string;
              }) => Promise<string | null>;
              updateWorkingMemory: (a: {
                threadId?: string;
                resourceId?: string;
                workingMemory: string;
              }) => Promise<unknown>;
            };
            agent?: { threadId?: string; resourceId?: string };
          };
          const memory = ctx.memory;
          if (!memory) {
            throw new Error("Memory instance is required for working memory updates");
          }
          const where = {
            threadId: ctx.agent?.threadId,
            resourceId: ctx.agent?.resourceId,
          };
          const existingRaw = await memory.getWorkingMemory(where);
          let existing: PlainObject = {};
          if (existingRaw) {
            try {
              existing = JSON.parse(existingRaw) as PlainObject;
            } catch {
              existing = {};
            }
          }
          if (isPlainObject(existing.mapUi)) {
            const nextMapUi = { ...existing.mapUi };
            delete nextMapUi.selectedPinId;
            existing.mapUi = nextMapUi;
          }
          await memory.updateWorkingMemory({
            ...where,
            workingMemory: JSON.stringify(existing),
          });
          return nativeResult;
        },
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
