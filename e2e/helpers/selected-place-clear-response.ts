/**
 * Verify an explicit negative answer to "is anything selected?".
 * A bare "no" elsewhere in the reply is not sufficient evidence.
 */
export function confirmsNothingSelected(text: string): boolean {
  return /^(?:no[,.!?:]?\s*)?(?:nothing\s+(?:is\s+)?selected|(?:there\s+(?:is|are)\s+)?no\s+(?:place|item|listing|rental|apartment|venue|restaurant|event|caf[eé]|club)\s+(?:(?:is|was)\s+)?(?:(?:currently|now)\s+)?selected|there\s+(?:is|are)\s+no\s+(?:selected\s+)?(?:place|item|listing|rental|venue)|(?:the\s+)?selection\s+(?:is\s+)?cleared|none\s+(?:is|are)\s+selected)/i.test(text.trim());
}
