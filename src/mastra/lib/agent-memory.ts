import { createTool } from "@mastra/core/tools";
import { Memory } from "@mastra/memory";
import { z, type ZodObject, type ZodRawShape, type ZodTypeAny } from "zod";
import { getMastraStorage } from "./storage";

type MemoryConfig = ConstructorParameters<typeof Memory>[0];

type PlainObject = Record<string, unknown>;
const isPlainObject = (value: unknown): value is PlainObject =>
  typeof value === "object" && value !== null && !Array.isArray(value);

type WorkingMemoryApi = {
  getThreadById?: (args: { threadId: string }) => Promise<unknown>;
  createThread?: (args: {
    threadId: string;
    resourceId?: string;
  }) => Promise<unknown>;
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
 * Serializes working-memory tool calls per thread in this process. The certified
 * `Memory` mutex covers only the write, so two overlapping updates could interleave
 * their read-merge-write. This closes the in-process window; across instances the
 * storage write is last-write-wins (see the `ponytail:` note in the clear path).
 */
const workingMemoryLocks = new Map<string, Promise<unknown>>();

function withThreadLock<T>(key: string, run: () => Promise<T>): Promise<T> {
  const previous = workingMemoryLocks.get(key) ?? Promise.resolve();
  const next = previous.then(run, run);
  const tail = next.then(
    () => undefined,
    () => undefined,
  );
  workingMemoryLocks.set(key, tail);
  void tail.then(() => {
    if (workingMemoryLocks.get(key) === tail) {
      workingMemoryLocks.delete(key);
    }
  });
  return next;
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
          const ctx = context as WorkingMemoryContext;
          const threadId = ctx.agent?.threadId;
          const resourceId = ctx.agent?.resourceId;
          // Lock per thread/resource. Identity-less contexts share no stored document, so
          // they are not serialized onto one global lock; they fail clearly instead (below).
          const lockKey = threadId
            ? `thread:${threadId}`
            : resourceId
              ? `resource:${resourceId}`
              : undefined;
          const run = async () => {
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

            const memory = ctx.memory;
            if (!memory) {
              return {
                success: false,
                message: "Memory is unavailable; the selected pin was not cleared.",
              };
            }
            if (!lockKey) {
              return {
                success: false,
                message:
                  "Missing thread or resource identity; the selected pin was not cleared.",
              };
            }

            const where = { threadId, resourceId };
            // Ensure the thread exists before the single write, using public Memory APIs
            // only. Calling the native tool with no payload would rewrite the stored
            // document (and clobber a non-object one) — exactly what this path avoids.
            if (where.threadId && memory.getThreadById) {
              let existingThread: unknown;
              try {
                existingThread = await memory.getThreadById({
                  threadId: where.threadId,
                });
              } catch (error) {
                // Fail the same way as a read/write failure (consistent, not swallowed) so
                // a transient storage problem is visible in logs and to the caller.
                console.warn("[agent-memory] thread lookup failed", {
                  threadId: where.threadId,
                  error: error instanceof Error ? error.message : error,
                });
                return {
                  success: false,
                  message:
                    "Could not look up the thread; the selected pin was not cleared.",
                };
              }
              if (!existingThread && memory.createThread) {
                try {
                  await memory.createThread({
                    threadId: where.threadId,
                    resourceId: where.resourceId,
                  });
                } catch (error) {
                  // A concurrent request may have created it first (upstream atomic
                  // insert-if-absent: mastra-ai/mastra#20148). Re-check: only fall through
                  // when the thread now exists; otherwise surface a real failure.
                  let created: unknown = null;
                  if (memory.getThreadById) {
                    created = await memory.getThreadById({
                      threadId: where.threadId,
                    }).catch(() => null);
                  }
                  if (!created) {
                    console.warn("[agent-memory] thread creation failed", {
                      threadId: where.threadId,
                      error: error instanceof Error ? error.message : error,
                    });
                    return {
                      success: false,
                      message:
                        "Could not ensure the thread; the selected pin was not cleared.",
                    };
                  }
                }
              }
            }

            let existingRaw: string | null;
            try {
              existingRaw = await memory.getWorkingMemory(where);
            } catch (error) {
              console.warn("[agent-memory] working-memory read failed", {
                threadId: where.threadId,
                error: error instanceof Error ? error.message : error,
              });
              return {
                success: false,
                message:
                  "Could not read working memory; the selected pin was not cleared.",
              };
            }
            let existing: PlainObject = {};
            if (existingRaw) {
              let parsed: unknown;
              try {
                parsed = JSON.parse(existingRaw);
              } catch {
                // Malformed JSON must not be replaced with {} — leave it intact.
                return {
                  success: false,
                  message:
                    "Stored working memory is not valid JSON; the selected pin was not cleared.",
                };
              }
              // A syntactically valid but non-object document (null / array / primitive)
              // must not be rewritten. Fail soft so a corrupted row surfaces as a tool
              // message instead of an unhandled 500, and the stored value is left intact.
              if (!isPlainObject(parsed)) {
                return {
                  success: false,
                  message:
                    "Stored working memory is not a JSON object; the selected pin was not cleared.",
                };
              }
              existing = parsed;
            }

            // ponytail: the certified @mastra/memory exposes no public atomic field-level
            // working-memory update, so this is one read-modify-write. withThreadLock
            // serializes MDE's own updates per thread in this process; across instances the
            // write remains last-write-wins (upstream: mastra-ai/mastra#24756). NOTE:
            // mastra-ai/mastra PR #25848 adds atomic merge for RESOURCE-scoped memory only,
            // so it does not cover MDE's thread scope. Upgrade path: drop this shim only when
            // Mastra supports atomic THREAD-scoped merge, or the native tool stops stripping nulls.
            try {
              await memory.updateWorkingMemory({
                ...where,
                workingMemory: JSON.stringify(mergeWorkingMemory(existing, patch)),
              });
            } catch (error) {
              console.warn("[agent-memory] working-memory update failed", {
                threadId: where.threadId,
                error: error instanceof Error ? error.message : error,
              });
              return {
                success: false,
                message:
                  "Could not update working memory; the selected pin was not cleared.",
              };
            }
            return { success: true };
          };
          return lockKey ? withThreadLock(lockKey, run) : run();
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
