/**
 * Require an explicit negative answer to "is any place selected?".
 * A standalone "no", incidental words like "known", or a historical name
 * without saying there is NO current selection is not enough.
 */
export function confirmsNothingSelected(text: string): boolean {
  const answer = text.trim();
  // A negative phrase must never override a later positive assertion. Strip
  // explicit negative claims first, then reject remaining "X is selected" claims.
  // This preserves the observed agent answer "say nothing is selected".
  const currentState = answer
    // A future or hypothetical selection is not a claim about the current item.
    .replace(/\b(?:once|if|when)\s+(?:a|an|the)\s+(?:place|item|listing|event|venue|rental|apartment|restaurant|caf[eé]|club)\s+(?:is|are)\s+(?:currently\s+)?selected\b/gi, "")
    // A past selection is not a claim about the current item.
    .replace(/\b(?:previously|formerly|last|earlier|old)\s+(?:public\s+)?selected\s+(?:place|item|record|listing|rental|apartment|venue|restaurant|event|caf[eé]|club)s?\b/gi, "");
  // Reject the other word order before removing explicit negatives: "The
  // selected place is Apartment B" never contains "is selected".
  if (/\b(?:selected|current(?:ly)?\s+selected)\s+(?:public\s+)?(?:place|item|record|listing|rental|apartment|venue|restaurant|event|caf[eé]|club)\s+(?:is|remains|still)\s+(?!none\b|no\b|not\b|nothing\b)(?:currently\s+)?(?:the\s+)?[a-z0-9áéíóúñ]/i.test(currentState)) return false;
  const remainingClaims = currentState
    .replace(/\b(?:nothing|none|no one|nobody)\s+(?:is|are)\s+(?:currently\s+)?selected\b/gi, "")
    .replace(/\bno\s+(?:(?:currently|active|public|new)\s+){0,3}(?:place|item|record|listing|rental|apartment|venue|restaurant|event|caf[eé]|club)\s+(?:is\s+)?(?:currently\s+)?selected\b/gi, "");
  if (/\b(?:is|remains|still)\s+(?:currently\s+)?selected\b/i.test(remainingClaims)) return false;
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
  // The earlier current-state check rejects contradictory "B is selected" claims;
  // mentions of previously selected places are not a contradiction.
  if (/^i (?:do not|don't) have any currently selected (?:place|item|listing|event|venue)\b/i.test(answer)) {
    return true;
  }
  const startsAsConfirmation =
    /^(?:no(?=[\s,.!?:—–-])|nothing\b|none\b|there\s+(?:is|are)\b|selection\b|currently[,\s]|right now[,\s]|based on (?:the )?current (?:browser )?state[,\s])/i.test(answer);
  if (!startsAsConfirmation) return false;

  return /\bnothing\s+(?:is\s+)?(?:currently\s+)?selected\b|\bnone\s+(?:is|are)\s+selected\b|\bthere(?:'s|\s+(?:is|are))\s+no\s+(?:(?:currently|active|public|selected|new)\s+){0,3}(?:place|item|record|listing|rental|apartment|venue|restaurant|event|caf[eé]|club)(?:\s+selected)?\b|\bno\s+(?:(?:currently|active|public|new)\s+){0,3}(?:place|item|record|listing|rental|apartment|venue|restaurant|event|caf[eé]|club)\s+(?:is\s+)?(?:currently\s+)?selected\b|\bselection\s+(?:is\s+)?cleared\b/i.test(answer);
}
