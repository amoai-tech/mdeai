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


/**
 * Candidate lookup using the *existing* indexed restaurants.fts_content GIN
 * column. The full name matcher above remains the authority; FTS only narrows
 * what we download. Raw tsquery terms are ASCII letters/numbers from the user
 * (never unescaped text), with short prefixes for stemming/diacritics.
 */
const nonNameWords = new Set([
  'a','an','and','any','anything','are','at','book','booking','but','can',
  'cite','city','could','de','del','direccion','do','does','donde','dont',
  'el','else','en','esta','find','for','give','hotel','i','in','is',
  'its','la','las','los','me','medellin','my','need','never','no',
  'not','of','or','please','reservation','reservations','reserve',
  'reservar','restaurante','restaurant','restaurants','source','street',
  'table','tables','the','there','to','us','want','what','whats','where',
  'which','with','without','y','you','your','queda','address','near',
]);

export function restaurantNameCandidateTsQuery(input: string): string | null {
  const normalized = input.normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/['’]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ');
  const words = [...new Set(normalized.split(/\s+/).filter(
    (word) => word.length >= 3 && !nonNameWords.has(word),
  ))].slice(0, 2);
  if (!words.length) return null;
  return words.map((word) => {
    const prefix = word.slice(0, 3);
    // Spanish articles may be stored attached to the name, e.g. Elcielo.
    const article = /\bel\s+/i.test(normalized)
      ? ' | el' + word.slice(0, 4) + ':*'
      : '';
    return '(' + prefix + ':*' + article + ')';
  }).join(' & ');
}
