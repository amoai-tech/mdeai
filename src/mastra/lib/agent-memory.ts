import { createTool } from "@mastra/core/tools";
import { Memory } from "@mastra/memory";
import { z, type ZodObject, type ZodRawShape, type ZodTypeAny } from "zod";
import { getMastraStorage } from "./storage";

type MemoryConfig = ConstructorParameters<typeof Memory>[0];

type PlainObject = Record<string, unknown>;
const isPlainObject = (value: unknown): value is PlainObject =>
  typeof value === "object" && value !== null && !Array.isArray(value);

type WorkingMemoryApi = {
  getWorkingMemory: (args: {
    threadId?: string;
    resourceId?: string;
  }) => Promise<string | null>;
  updateWorkingMemory: (args: {
    threadId?: string;
    resourceId?: string;
    workingMemory: string;
  }) => Promise<unknown>;
};

type WorkingMemoryContext = {
  memory?: WorkingMemoryApi;
  agent?: { threadId?: string; resourceId?: string };
};

/**
 * Mirror of the certified native tool's documented merge, used only for the
 * `selectedPinId: null` clear path (the native tool strips that null before merging).
 * Objects merge, arrays replace, primitives overwrite, `null` deletes, `undefined`
 * is skipped. MDE's `memoryInput` already removed provider padding, so the only null
 * that reaches here is the deliberate pin clear.
 */
function mergeWorkingMemory(existing: PlainObject, patch: PlainObject): PlainObject {
  const result: PlainObject = { ...existing };
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined) continue;
    if (value === null) {
      delete result[key];
      continue;
    }
    if (Array.isArray(value)) {
      result[key] = value;
      continue;
    }
    if (isPlainObject(value)) {
      result[key] = mergeWorkingMemory(
        isPlainObject(result[key]) ? result[key] : {},
        value,
      );
      continue;
    }
    result[key] = value;
  }
  return result;
}

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
          if (!isPlainObject(patch)) {
            return originalExecute(inputData, context);
          }
          const clearSelectedPin =
            isPlainObject(patch.mapUi) &&
            Object.prototype.hasOwnProperty.call(patch.mapUi, "selectedPinId") &&
            patch.mapUi.selectedPinId === null;
          if (!clearSelectedPin) {
            return originalExecute(inputData, context);
          }

          const ctx = context as WorkingMemoryContext;
          const memory = ctx.memory;
          if (!memory) {
            throw new Error("Memory instance is required for working memory updates");
          }

          // Run the native tool with no memory payload so it still ensures the thread
          // exists without writing the patch, then apply the whole patch once with MDE's
          // merge semantics — the native tool would strip the deliberate null.
          await originalExecute({ memory: undefined }, context);

          const where = {
            threadId: ctx.agent?.threadId,
            resourceId: ctx.agent?.resourceId,
          };
          const existingRaw = await memory.getWorkingMemory(where);
          let existing: PlainObject = {};
          if (existingRaw) {
            let parsed: unknown;
            try {
              parsed = JSON.parse(existingRaw);
            } catch {
              parsed = {};
            }
            // A syntactically valid but non-object document (null / array / primitive)
            // must not be rewritten — fail closed instead of clobbering it.
            if (!isPlainObject(parsed)) {
              throw new Error("Stored working memory must be a plain object");
            }
            existing = parsed;
          }

          // ponytail: the certified @mastra/memory exposes no public atomic field-level
          // working-memory update, so this is one read-modify-write. Doing it once (not
          // native-write + delete) removes the window where the native tool reports
          // success but the pin survives. Upgrade path: drop this shim when the native
          // tool stops stripping null optionals or exposes an atomic clear.
          await memory.updateWorkingMemory({
            ...where,
            workingMemory: JSON.stringify(mergeWorkingMemory(existing, patch)),
          });
          return { success: true };
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
