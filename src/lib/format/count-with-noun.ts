/**
 * "1 café", "17 cafés", "1 restaurant", "0 restaurants".
 *
 * `Intl.PluralRules` rather than `count === 1`, because the plural form is a property of the
 * language, not of the number. English is the only locale rendered today; using the standard
 * mechanism keeps the copy correct if that changes.
 */
export function countWithNoun(count: number, singular: string, plural: string): string {
  const noun = new Intl.PluralRules("en-US").select(count) === "one" ? singular : plural;
  return `${count} ${noun}`;
}
