import { describe, expect, it } from 'vitest';
import { restaurantNameMentioned } from '../search-restaurants';

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
