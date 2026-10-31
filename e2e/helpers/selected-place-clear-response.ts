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
  const selectionLines = answer.split(/\r?\n/)
    .map((line) => line.trim().toLowerCase())
    .filter((line) => line.startsWith("selected public item:"));
  if (selectionLines.length > 0) {
    return selectionLines.length === 1 &&
      (selectionLines[0] === "selected public item: none" ||
       selectionLines[0] === "selected public item: none.");
  }
  const startsAsConfirmation =
    /^(?:no(?=[\s,.!?:—–-])|nothing\b|none\b|there\s+(?:is|are)\b|selection\b|currently[,\s]|right now[,\s]|based on (?:the )?current (?:browser )?state[,\s])/i.test(answer);
  if (!startsAsConfirmation) return false;

  return /\bnothing\s+(?:is\s+)?(?:currently\s+)?selected\b|\bnone\s+(?:is|are)\s+selected\b|\bthere(?:'s|\s+(?:is|are))\s+no\s+(?:(?:currently|active|public|selected|new)\s+){0,3}(?:place|item|record|listing|rental|apartment|venue|restaurant|event|caf[eé]|club)(?:\s+selected)?\b|\bno\s+(?:(?:currently|active|public|new)\s+){0,3}(?:place|item|record|listing|rental|apartment|venue|restaurant|event|caf[eé]|club)\s+(?:is\s+)?(?:currently\s+)?selected\b|\bselection\s+(?:is\s+)?cleared\b/i.test(answer);
}
