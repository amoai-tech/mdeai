import { mdeUI } from "@/components/copilot/a2ui/mde-ui-catalog";
import { mdeTheme } from "@/components/copilot/a2ui/mde-theme";

/**
 * The one `generativeUI` configuration both route-owner providers pass to
 * CopilotKit. Keeping it in one object means the catalog, theme and agent
 * allowlist cannot drift between the root layout and `/chat`.
 */
export const MDE_GENERATIVE_UI = {
  ui: mdeUI,
  agentIds: ["conciergeAgent"],
  theme: mdeTheme,
};
