import { strict as assert } from "node:assert";
import { SUGGESTION_TYPE_FOR_RULE } from "../rules-engine/suggestion-types.ts";

Deno.test("every generated proactive rule maps to a DB-supported suggestion type", () => {
  const supported = new Set([
    "add_activity", "book_restaurant", "budget_alert", "local_event",
    "time_optimization", "weather_alert", "price_drop", "cancellation_notice",
  ]);
  const knownTriggers = [
    "empty_day", "budget_warning", "budget_exceeded",
    "booking_reminder", "trip_starting",
  ];
  assert.deepEqual(Object.keys(SUGGESTION_TYPE_FOR_RULE).sort(), knownTriggers.sort());
  for (const type of Object.values(SUGGESTION_TYPE_FOR_RULE)) {
    assert.equal(supported.has(type), true, type + " violates proactive_suggestions_type_check");
  }
  assert.equal(SUGGESTION_TYPE_FOR_RULE.empty_day, "add_activity");
  assert.equal(SUGGESTION_TYPE_FOR_RULE.budget_exceeded, "budget_alert");
});
