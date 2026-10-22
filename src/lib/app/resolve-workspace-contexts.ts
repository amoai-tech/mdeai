import "server-only";

import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import {
  loadWorkspaceResolution,
  type WorkspaceLookup,
  type WorkspaceResolution,
} from "@/lib/app/workspace-resolution";

export type { WorkspaceResolution } from "@/lib/app/workspace-resolution";

/**
 * Request-cached entry point. The layout and the page share one resolution per
 * request. The real Supabase client is structurally compatible with
 * `WorkspaceLookup`; the cast keeps the loader testable without the generated
 * client type.
 */
export const resolveWorkspaceContexts = cache(
  async (): Promise<WorkspaceResolution> =>
    loadWorkspaceResolution(
      (await createClient()) as unknown as WorkspaceLookup,
    ),
);
