/** A query either produced a value or failed; `[]` is never a stand-in for failure. */
export type Result<T> =
  | { status: "ok"; value: T }
  | { status: "error"; message: string };

export const PERSONAL_LOAD_ERROR =
  "We couldn't load this right now. Please try again.";
