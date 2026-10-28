/**
 * Match an explicitly mentioned catalog name, not merely a semantically similar
 * restaurant. Handles accents, punctuation and close word-order variants.
 */
export function restaurantNameMentioned(queryText: string, name: string): boolean {
  const normalize = (text: string) =>
    text.normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/['’]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, ' ')
      .trim()
      .replace(/\s+/g, ' ');

  // Normalize common Spanish article spacing (e.g. El Cielo / Elcielo).
  const compactArticle = (text: string) => text.replace(/\b(el|la)\s+([a-z0-9]+)/g, '$1$2');
  const query = compactArticle(normalize(queryText));
  const fullName = compactArticle(normalize(name));
  if (fullName.length < 5 || !query) return false;

  // A venue often carries a generic business/city suffix in the catalog.
  // Permit a caller to use the distinctive name without that suffix.
  const candidates = [fullName];
  let shortName = fullName;
  while (/\s+(medellin|restaurant|restaurante|hotel)$/.test(shortName)) {
    shortName = shortName.replace(/\s+(medellin|restaurant|restaurante|hotel)$/, '');
    if (shortName.length >= 5) candidates.push(shortName);
  }

  for (const nameText of candidates) {
    if ((' ' + query + ' ').includes(' ' + nameText + ' ')) return true;
    // Word-order variations must form a contiguous phrase, not be scattered
    // across generic discovery instructions.
    const nameWords = nameText.split(' ');
    if (nameWords.length < 2) continue;
    const queryWords = query.split(' ');
    const sortedName = [...nameWords].sort().join(' ');
    for (let i = 0; i <= queryWords.length - nameWords.length; i++) {
      if ([...queryWords.slice(i, i + nameWords.length)].sort().join(' ') === sortedName) return true;
    }
  }
  return false;
}
