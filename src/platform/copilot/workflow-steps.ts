/** Tool → workflow strip labels (Phase A: UI driven by generative tool status). */

export type WorkflowKind =
  | "rental"
  | "new_project"
  | "event"
  | "restaurant"
  | "attraction"
  | "grounded";

export type WorkflowPhase = "idle" | "running" | "complete" | "error";

export const WORKFLOW_STEP_LABELS: Record<WorkflowKind, readonly string[]> = {
  rental: ["Searching listings", "Ranking matches", "Results ready"],
  new_project: ["Finding projects", "Checking facts", "Results ready"],
  event: ["Discovering events", "Filtering by vibe", "Results ready"],
  restaurant: ["Finding places", "Checking ratings", "Results ready"],
  attraction: ["Scanning spots", "Curating picks", "Results ready"],
  grounded: ["Grounding search", "Verifying places", "Results ready"],
};

const TOOL_KIND_MAP: Record<string, WorkflowKind> = {
  searchRentalsTool: "rental",
  "search-rentals": "rental",
  searchNewProjectsTool: "new_project",
  "search-new-projects": "new_project",
  compareNewProjectsTool: "new_project",
  "compare-new-projects": "new_project",
  searchEventsTool: "event",
  "search-events": "event",
  searchRestaurantsTool: "restaurant",
  "search-restaurants": "restaurant",
  searchAttractionsTool: "attraction",
  "search-attractions": "attraction",
  searchGroundedPlacesTool: "grounded",
  "search-grounded-places": "grounded",
};

export function toolNameToWorkflowKind(name: string): WorkflowKind | null {
  return TOOL_KIND_MAP[name] ?? null;
}

/** Only real tool completion may advance the strip. Time is NOT evidence of progress. */
export function activeWorkflowStepIndex(
  phase: WorkflowPhase,
  stepCount: number,
): number {
  if (phase === "idle" || stepCount <= 0) return -1;
  if (phase === "complete" || phase === "error") return stepCount - 1;
  // Until fine-grained AG-UI tool events are wired, keep intermediate steps
  // pending rather than claiming the agent ranked/verified results by a clock.
  return 0;
}
