import { describe, expect, it } from 'vitest';
import { restaurantNameMentioned } from '../search-restaurants';
import { restaurantNameCandidateTsQuery } from '../../lib/restaurant-name-match';

describe('SAN-1531 restaurant name-first matcher (no hardcoded venue mapping)', () => {
  it.each([
    ['Where is Mal De Ojo restaurant in Medellín?', 'Mal De Ojo'],
    ['mal de ojo Medellín', 'Mal De Ojo'],
    ['Mal ojo de address', 'Mal De Ojo'],
    ['Where is El Cielo?', 'Elcielo Hotel Medellín'],
    ['Where is El Cielo?', 'Elcielo Restaurant Medellín'],
    ['Where is Mondongo’s Laureles?', 'Mondongos Laureles'],
    ['¿Dónde queda El Botánico?', 'El Botánico'],
    ['Are there tables at Carmen?', 'Carmen'],
  ])('finds an explicit name in %s', (queryText, restaurantName) => {
    expect(restaurantNameMentioned(queryText, restaurantName)).toBe(true);
  });

  it.each([
    ['Italian dinner in El Poblado', 'Elcielo Restaurant Medellín'],
    ['Find a restaurant in Laureles', 'Mondongos Laureles'],
    ['quiet rooftop for date night', 'El Botánico'],
    ['Carmenita bakery', 'Carmen'],
    ['What is El Poblado like?', 'El Botánico'],
    ['', 'Mal De Ojo'],
  ])('does not turn broad queries or substrings into named venues: %s', (queryText, restaurantName) => {
    expect(restaurantNameMentioned(queryText, restaurantName)).toBe(false);
  });
});


describe('SAN-1531 adversarial matcher and indexed candidate lookup', () => {
  it.each([
    ['', 'Mal De Ojo'],
    ['   ', 'Mal De Ojo'],
    ['Where is Mal De Ojos?', 'Mal De Ojo'],
    ['Where is El Cielos?', 'Elcielo Hotel Medellín'],
    ['Where is MalDeOjo?', 'Mal De Ojo'],
    ['Mal De Ojo', ''],
    ['Mal De Ojo', '  '],
    ['Mal De Ojo', 'Mal De Ojos'],
    ['Carmenita', 'Carmen'],
  ])('rejects near misses: query=%s name=%s', (text, name) => {
    expect(restaurantNameMentioned(text, name)).toBe(false);
  });
  it.each([
    ['  Where is Mal De Ojo?  ', 'Mal De Ojo'],
    ['¿Dónde queda El Botánico?', 'El Botánico'],
    ['(Mal De Ojo) address', 'Mal De Ojo'],
  ])('permits punctuation and whitespace boundaries: %s', (text, name) => {
    expect(restaurantNameMentioned(text, name)).toBe(true);
  });

  it('forms an indexed, sanitized candidate predicate without generic request words', () => {
    const s = restaurantNameCandidateTsQuery(
      'Where is Mal De Ojo restaurant in Medellín? Give its street address and cite a source. Do not book anything.',
    );
    expect(s).toBe('(mal:*) & (ojo:*)');
  });
  it('matches attached Spanish article variants and accent roots', () => {
    expect(restaurantNameCandidateTsQuery('Where is El Cielo?')).toContain('elciel:*');
    expect(restaurantNameCandidateTsQuery('¿Dónde queda El Botánico?')).toContain('bot:*');
  });
  it('rejects empty and meaningless candidate queries (never full-catalog fetch)', () => {
    for (const input of ['', '   ', 'Where is it?']) {
      expect(restaurantNameCandidateTsQuery(input)).toBeNull();
    }
  });
  it('cannot inject PostgREST/tsquery operators', () => {
    expect(restaurantNameCandidateTsQuery('Mal De Ojo | ! & ; :*')).toBe('(mal:*) & (ojo:*)');
  });
});
