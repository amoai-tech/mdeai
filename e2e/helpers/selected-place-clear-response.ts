/**
 * Require an explicit negative answer to "is any place selected?".
 * A standalone "no", incidental words like "known", or a historical name
 * without saying there is NO current selection is not enough.
 */
export function confirmsNothingSelected(text: string): boolean {
  const answer = text.trim();
  const startsAsConfirmation =
    /^(?:no(?=[\s,.!?:—–-])|nothing\b|none\b|there\s+(?:is|are)\b|selection\b)/i.test(answer);
  if (!startsAsConfirmation) return false;

  return /\bnothing\s+(?:is\s+)?selected\b|\bnone\s+(?:is|are)\s+selected\b|\bthere\s+(?:is|are)\s+no\s+(?:(?:currently|active|public|selected)\s+){0,3}(?:place|item|record|listing|rental|apartment|venue|restaurant|event|caf[eé]|club)(?:\s+selected)?\b|\bno\s+(?:(?:currently|active|public)\s+){0,3}(?:place|item|record|listing|rental|apartment|venue|restaurant|event|caf[eé]|club)\s+(?:is\s+)?(?:currently\s+)?selected\b|\bselection\s+(?:is\s+)?cleared\b/i.test(answer);
}
