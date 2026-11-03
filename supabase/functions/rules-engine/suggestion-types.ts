/** Map precise rule triggers to the canonical proactive_suggestions CHECK enum.
 * Preserve the specific trigger in metadata.source_rule.
 */
export const SUGGESTION_TYPE_FOR_RULE = {
  empty_day: "add_activity",
  budget_warning: "budget_alert",
  budget_exceeded: "budget_alert",
  booking_reminder: "time_optimization",
  trip_starting: "time_optimization",
} as const satisfies Record<string, "add_activity" | "budget_alert" | "time_optimization">;

export type SuggestionRule = keyof typeof SUGGESTION_TYPE_FOR_RULE;
