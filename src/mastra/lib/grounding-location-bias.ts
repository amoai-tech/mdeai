import type { MapUiState } from "@/platform/contracts/map-ui-state";

export type GroundingLocationBias = {
  latitude: number;
  longitude: number;
};

type WorkingMemoryReader = {
  getWorkingMemory?: (args: {
    threadId?: string;
    resourceId?: string;
  }) => Promise<unknown>;
};

export type GroundingMemoryContext = {
  memory?: WorkingMemoryReader;
  threadId?: string;
  resourceId?: string;
};

type ToolMemoryContext = GroundingMemoryContext & {
  mastra?: {
    getAgentById?: (id: string) => {
      getMemory?: (args: { requestContext?: unknown }) =>
        | Promise<WorkingMemoryReader | undefined>
        | WorkingMemoryReader
        | undefined;
    };
  };
  agent?: { agentId?: string; threadId?: string; resourceId?: string };
  requestContext?: unknown;
};

/** Resolve the agent's thread-scoped memory from Mastra's tool execution context. */
export async function resolveGroundingMemory(
  context: unknown,
): Promise<GroundingMemoryContext> {
  const ctx = (context ?? {}) as ToolMemoryContext;
  if (ctx.memory?.getWorkingMemory) {
    return {
      memory: ctx.memory,
      threadId: ctx.agent?.threadId ?? ctx.threadId,
      resourceId: ctx.agent?.resourceId ?? ctx.resourceId,
    };
  }

  const agentId = ctx.agent?.agentId;
  if (!agentId || !ctx.mastra?.getAgentById) return {};

  try {
    const agent = ctx.mastra.getAgentById(agentId);
    const memory = await agent?.getMemory?.({ requestContext: ctx.requestContext });
    if (!memory?.getWorkingMemory) return {};
    return {
      memory,
      threadId: ctx.agent?.threadId,
      resourceId: ctx.agent?.resourceId,
    };
  } catch {
    return {};
  }
}

function isValidViewport(viewport: MapUiState["viewport"]): boolean {
  if (!viewport) return false;
  return (
    Number.isFinite(viewport.lat) &&
    Number.isFinite(viewport.lng) &&
    Number.isFinite(viewport.zoom) &&
    viewport.lat >= -90 &&
    viewport.lat <= 90 &&
    viewport.lng >= -180 &&
    viewport.lng <= 180 &&
    viewport.zoom >= 0 &&
    viewport.zoom <= 22
  );
}

/** Sync resolver when working memory is already loaded. */
export function locationBiasFromMapUi(
  mapUi: MapUiState | undefined,
): GroundingLocationBias | undefined {
  const viewport = mapUi?.viewport;
  if (!viewport || !isValidViewport(viewport)) return undefined;
  return { latitude: viewport.lat, longitude: viewport.lng };
}

function mapUiFromMemory(raw: unknown): MapUiState | undefined {
  let candidate = raw;
  if (typeof candidate === "string") {
    try {
      candidate = JSON.parse(candidate);
    } catch {
      return undefined;
    }
  }
  if (!candidate || typeof candidate !== "object") return undefined;
  const mapUi = (candidate as { mapUi?: unknown }).mapUi ?? candidate;
  if (!mapUi || typeof mapUi !== "object") return undefined;
  return mapUi as MapUiState;
}

/** Explicit tool input wins; else the current thread's mapUi.viewport. */
export async function resolveGroundingLocationBias(
  input: {
    locationBias?: { latitude: number; longitude: number };
  },
  context?: GroundingMemoryContext,
): Promise<GroundingLocationBias | undefined> {
  const fromInput = input.locationBias;
  if (
    fromInput &&
    Number.isFinite(fromInput.latitude) &&
    Number.isFinite(fromInput.longitude) &&
    fromInput.latitude >= -90 &&
    fromInput.latitude <= 90 &&
    fromInput.longitude >= -180 &&
    fromInput.longitude <= 180
  ) {
    return {
      latitude: fromInput.latitude,
      longitude: fromInput.longitude,
    };
  }

  const memory = context?.memory;
  if (!memory?.getWorkingMemory) return undefined;
  try {
    // Preserve the memory object as the receiver; Memory methods may use `this`.
    const raw = await memory.getWorkingMemory({
      threadId: context?.threadId,
      resourceId: context?.resourceId,
    });
    return locationBiasFromMapUi(mapUiFromMemory(raw));
  } catch {
    return undefined;
  }
}
