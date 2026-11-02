import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { getHostContext } from "@/mastra/tools/hostops-read-tools";
import { readBrokerWorkspace } from "@/lib/rentals/broker-concierge-read";

/**
 * One read-only tool shared by /app/rentals and /host/rentals through
 * the existing conciergeAgent. Authenticated RLS-scoped Supabase comes
 * from the runtime RequestContext, NEVER a model-selected identity.
 */
export const readBrokerWorkspaceTool = createTool({
  id: "read-broker-workspace",
  description:
    "Read the SIGNED-IN BROKER'S OWN rental listings, real viewing requests, leads and KPIs. For 'my rentals', 'my listings', 'which viewing requests need attention?', and 'how is my rental business doing?'. Never use public rental search for private broker operations. Read-only: cannot publish, send messages or change a viewing.",
  inputSchema: z.object({
    focus: z.enum(["overview", "listings", "viewings"]).default("overview"),
  }),
  execute: async (input: { focus: "overview" | "listings" | "viewings" }, context?: unknown) => {
    // Same authenticated user and scoped client used by hostOpsAgent.
    // readBrokerWorkspace checks for an actual broker profile and restricts
    // every query to the server-derived user, with Supabase RLS as backup.
    const { supabase, userId } = getHostContext(context);
    return readBrokerWorkspace(supabase, userId, input.focus);
  },
});
