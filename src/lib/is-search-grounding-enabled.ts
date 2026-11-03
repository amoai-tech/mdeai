/**
 * Web grounding is opt-in in every environment, including Vercel production.
 * Do not tie product capabilities to NODE_ENV / deployment target.
 * The quota RPC and ADK endpoint must be working before enabling the flag.
 */
export function isSearchGroundingEnabled(): boolean {
  return process.env.ENABLE_SEARCH_GROUNDING?.trim() === "1";
}
