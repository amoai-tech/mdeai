import type { SchedulePrefill } from "@/lib/leads/schedule-prefill";

/**
 * SAN-1205 — who owns each contact field of the viewing form.
 *
 * A field is `fromLookup` only when the account lookup filled it while it was blank. Typing in a
 * field hands it back to the renter. A lookup never claims a field that already has text, even
 * identical text, and a signed-out lookup clears only the fields it filled. That is what stops a
 * slow lookup from erasing what the renter typed, while a previous user's details still cannot
 * leak on a shared browser.
 */
export type ContactField = { value: string; fromLookup: boolean };
export type ContactState = { name: ContactField; email: ContactField; phone: ContactField };
export type ContactFieldName = keyof ContactState;

const BLANK: ContactField = { value: "", fromLookup: false };
export const INITIAL_CONTACT: ContactState = { name: BLANK, email: BLANK, phone: BLANK };

export type ContactAction =
  | { type: "typed"; field: ContactFieldName; value: string }
  | { type: "lookup"; prefill: SchedulePrefill | null }
  | { type: "reset" };

/** `incoming` is the looked-up value, or `null` when nobody is signed in. */
const applyLookup = (current: ContactField, incoming: string | null): ContactField => {
  if (incoming === null) return current.fromLookup ? BLANK : current;
  if (current.value === "" && incoming !== "") return { value: incoming, fromLookup: true };
  return current;
};

export const contactReducer = (state: ContactState, action: ContactAction): ContactState => {
  if (action.type === "reset") return INITIAL_CONTACT;
  if (action.type === "lookup") {
    const { prefill } = action;
    return {
      name: applyLookup(state.name, prefill ? prefill.name : null),
      email: applyLookup(state.email, prefill ? prefill.email : null),
      phone: applyLookup(state.phone, prefill ? prefill.phone : null),
    };
  }
  const typed: ContactField = { value: action.value, fromLookup: false };
  switch (action.field) {
    case "name":
      return { ...state, name: typed };
    case "email":
      return { ...state, email: typed };
    default:
      return { ...state, phone: typed };
  }
};
