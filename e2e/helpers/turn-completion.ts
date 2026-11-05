/**
 * SAN-1639 · deciding when a submitted turn is actually finished.
 *
 * The previous helper treated any visible assistant message as "the run started",
 * so a PREVIOUS answer satisfied it, and then treated a missing Stop control as
 * "finished", which could hide a request that never ran or failed later. Both are
 * false successes in a suite that is supposed to prove a fix.
 *
 * The rule here is deliberately narrow:
 *  - a reply only counts when the count grew past the count taken at submit time;
 *  - completion needs either the response to finish, or a NEW reply plus no Stop;
 *  - a rejected/failed request is a failure, never completion.
 */
export type TurnObservation = {
  /** The submit's HTTP response finished (or its promise settled). */
  settled: boolean;
  /** Non-null when the request or the agent run failed. */
  failure: unknown;
  stopVisible: boolean;
  /** Assistant replies counted at submit time. */
  repliesBefore: number;
  /** Assistant replies counted now. */
  repliesNow: number;
};

export type TurnState = "pending" | "running" | "done" | "failed";

export function assessTurn(observation: TurnObservation): TurnState {
  if (observation.failure) return "failed";
  if (observation.settled) return "done";

  // A previous answer must never satisfy this: only growth counts.
  const producedNewReply = observation.repliesNow > observation.repliesBefore;

  if (observation.stopVisible) return "running";
  // The AG-UI stream can stay open after the run ends; a NEW reply with no Stop
  // control is the UI's own finished signal.
  if (producedNewReply) return "done";
  return "pending";
}

/** True once the turn has left the "nothing has happened yet" state. */
export function hasStarted(state: TurnState): boolean {
  return state !== "pending";
}

/** True once the turn can no longer change. */
export function isTerminal(state: TurnState): boolean {
  return state === "done" || state === "failed";
}
