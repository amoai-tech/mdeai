"use client";

import { NewProjectResults } from "@/components/new-projects/concierge/project-result-cards";
import { useNewProjectFastPath } from "@/components/chat/new-project-fast-path-context";

/** Inline New Projects cards from the fast-path search (no CopilotKit tool render). */
export function NewProjectFastPathPanel() {
  const { toolResult } = useNewProjectFastPath();
  if (!toolResult) return null;

  return (
    <div data-testid="new-project-fast-path-panel" className="px-2 pb-3 sm:px-4">
      <NewProjectResults result={toolResult} />
    </div>
  );
}
