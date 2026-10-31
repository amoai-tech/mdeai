/**
 * Require an explicit negative answer to "is any place selected?".
 * A standalone "no", incidental words like "known", or a historical name
 * without saying there is NO current selection is not enough.
 */
export function confirmsNothingSelected(text: string): boolean {
  const answer = text.trim();
  // Some grounded agents use a structured, explicit current-state answer.
  // Only a single exact NONE field counts: a second selected item or an
  // item name must not be misclassified as a cleared selection.
  // The agent may write this field on its own line or after "Current page: /...".
  // Match the field value only through its terminating punctuation/newline; reject
  // contradictory fields, selected names, or "NONE is not correct".
  const states = [...answer.matchAll(/\bselected public item:\s*([^.!?\r\n]*)(?:[.!?]|\r?\n|$)/gi)]
    .map((match) => match[1].trim().toLowerCase());
  if (states.length > 0) return states.length === 1 && states[0] === "none";
  // Another exact negative form observed from the real Events agent on mobile.
  // Do not accept a sentence that subsequently contradicts the absence of selection.
  if (/^i (?:do not|don't) have any currently selected (?:place|item|listing|event|venue)\b/i.test(answer)) {
    return !/\b(?:but|however)\b[^.!?]*\bselected\b/i.test(answer);
  }
  const startsAsConfirmation =
    /^(?:no(?=[\s,.!?:—–-])|nothing\b|none\b|there\s+(?:is|are)\b|selection\b|currently[,\s]|right now[,\s]|based on (?:the )?current (?:browser )?state[,\s])/i.test(answer);
  if (!startsAsConfirmation) return false;

  return /\bnothing\s+(?:is\s+)?(?:currently\s+)?selected\b|\bnone\s+(?:is|are)\s+selected\b|\bthere(?:'s|\s+(?:is|are))\s+no\s+(?:(?:currently|active|public|selected|new)\s+){0,3}(?:place|item|record|listing|rental|apartment|venue|restaurant|event|caf[eé]|club)(?:\s+selected)?\b|\bno\s+(?:(?:currently|active|public|new)\s+){0,3}(?:place|item|record|listing|rental|apartment|venue|restaurant|event|caf[eé]|club)\s+(?:is\s+)?(?:currently\s+)?selected\b|\bselection\s+(?:is\s+)?cleared\b/i.test(answer);
}
