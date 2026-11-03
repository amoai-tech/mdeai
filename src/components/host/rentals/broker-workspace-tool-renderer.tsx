"use client";

import { useRenderTool } from "@copilotkit/react-core/v2";
import { z } from "zod";

/**
 * The registered name is the Mastra agent tool-map key, not createTool().id.
 * This only renders AG-UI tool activity; it never executes a browser-side read
 * or changes the authenticated agent's data boundary.
 */
export function BrokerWorkspaceToolRenderer() {
  useRenderTool({
    name: "readBrokerWorkspaceTool",
    agentId: "conciergeAgent",
    parameters: z.object({
      focus: z.enum(["overview", "listings", "viewings"]).optional(),
    }),
    render: ({ status }) => (
      <p data-testid="broker-workspace-tool-status" className="rounded-md border border-border px-3 py-2 text-xs text-muted-foreground">
        {status === "complete"
          ? "Broker workspace lookup finished."
          : "Checking your broker workspace…"}
      </p>
    ),
  });
  return null;
}
