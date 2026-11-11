# Places Autocomplete & Search — current React patterns

Use this file only after checking current Google Maps JavaScript Places guidance. Prefer the modern Place APIs and keep requested fields minimal.

Primary sources:
- https://developers.google.com/maps/documentation/javascript/place-autocomplete-data
- https://developers.google.com/maps/documentation/javascript/place-autocomplete-new
- https://developers.google.com/maps/documentation/javascript/places-js
- https://developers.google.com/maps/documentation/javascript/reference/place

## Custom autocomplete with the Place Autocomplete Data API

For a custom React input, load the `places` library and call `AutocompleteSuggestion.fetchAutocompleteSuggestions()`. Keep one `AutocompleteSessionToken` for a user autocomplete session, then start a new token after selection. For this browser pattern, the HTTP-referrer-restricted browser key must allow both **Maps JavaScript API and Places API (New)**; keep the key limited to only the browser APIs the deployed feature actually uses.

```tsx
import { useEffect, useState } from 'react';
import { useMapsLibrary } from '@vis.gl/react-google-maps';

export function PlaceAutocomplete({
  onSelect,
}: {
  onSelect: (place: google.maps.places.Place | null) => void;
}) {
  const places = useMapsLibrary('places');
  const [input, setInput] = useState('');
  const [suggestions, setSuggestions] = useState<google.maps.places.AutocompleteSuggestion[]>([]);
  const [sessionToken, setSessionToken] = useState<google.maps.places.AutocompleteSessionToken | null>(null);

  useEffect(() => {
    if (places) setSessionToken(new places.AutocompleteSessionToken());
  }, [places]);

  useEffect(() => {
    if (!places || !sessionToken || !input.trim()) {
      setSuggestions([]);
      return;
    }

    let cancelled = false;
    const timer = window.setTimeout(async () => {
      try {
        const { suggestions: next } = await places.AutocompleteSuggestion.fetchAutocompleteSuggestions({
          input,
          sessionToken,
          includedRegionCodes: ['co'],
        });
        if (!cancelled) setSuggestions(next);
      } catch (error) {
        if (!cancelled) setSuggestions([]);
        console.error('Place autocomplete failed', error);
      }
    }, 250);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [input, places, sessionToken]);

  if (!places) return null;

  return (
    <div>
      <input value={input} onChange={(e) => setInput(e.target.value)} />
      {suggestions.map((suggestion) => {
        const prediction = suggestion.placePrediction;
        if (!prediction) return null;
        return (
          <button
            key={prediction.placeId}
            type="button"
            onClick={async () => {
              try {
                const place = prediction.toPlace();
                await place.fetchFields({
                  fields: ['displayName', 'formattedAddress', 'location'],
                });
                onSelect(place);
                setInput(place.formattedAddress ?? place.displayName ?? '');
                setSuggestions([]);
                setSessionToken(new places.AutocompleteSessionToken());
              } catch (error) {
                console.error('Place details failed', error);
                onSelect(null);
              }
            }}
          >
            {prediction.text.toString()}
          </button>
        );
      })}
    </div>
  );
}
```

Treat field names and request options as version-sensitive: verify them in the current reference before copying this pattern.

## Google-provided autocomplete element

When a custom UI is unnecessary, prefer Google’s current `PlaceAutocompleteElement`. On selection, convert the prediction to a `Place` and fetch only the fields the UI needs.

```ts
placeAutocomplete.addEventListener('gmp-select', async ({ placePrediction }) => {
  try {
    const place = placePrediction.toPlace();
    await place.fetchFields({
      fields: ['displayName', 'formattedAddress', 'location', 'viewport'],
    });
  } catch (error) {
    console.error('Place selection failed', error);
  }
});
```

## Place details

For a known place ID, construct a `Place`, then fetch only required fields.

```tsx
const places = useMapsLibrary('places');

async function fetchPlace(placeId: string) {
  if (!places) return null;
  try {
    const place = new places.Place({ id: placeId });
    await place.fetchFields({
      fields: ['displayName', 'formattedAddress', 'location'],
    });
    return place;
  } catch (error) {
    console.error('Place details failed', error);
    return null;
  }
}
```

## Nearby search

Use the current `Place.searchNearby()` API and declare the minimum result fields.

```tsx
const { Place } = places;
try {
  const { places: results } = await Place.searchNearby({
    fields: ['id', 'displayName', 'location'],
    locationRestriction: {
      center: { lat: 6.2442, lng: -75.5812 },
      radius: 1500,
    },
    includedPrimaryTypes: ['restaurant'],
    maxResultCount: 10,
  });
} catch (error) {
  console.error('Nearby search failed', error);
}
```

## Text search

Use `Place.searchByText()` when the user supplies a query rather than a nearby category filter.

```tsx
const { Place } = places;
try {
  const { places: results } = await Place.searchByText({
    textQuery: 'coffee in Laureles Medellín',
    fields: ['id', 'displayName', 'formattedAddress', 'location'],
    maxResultCount: 10,
  });
} catch (error) {
  console.error('Text search failed', error);
}
```

## Geocoding

Geocoding is separate from Places search. Use the current Geocoding API/library when the intent is address ↔ coordinates rather than place discovery. Keep region/language intentional for international flows.

```tsx
const geocoding = useMapsLibrary('geocoding');
if (!geocoding) return;
const geocoder = new geocoding.Geocoder();
try {
  const response = await geocoder.geocode({ address: 'Parque Lleras, Medellín' });
  const location = response.results[0]?.geometry.location;
} catch (error) {
  console.error('Geocoding failed', error);
}
```

## Review checklist

- use current Place APIs for new work
- use one autocomplete session token per user search session
- fetch only fields the UI actually renders
- keep country/region/language behavior intentional
- keep browser keys restricted to approved origins and APIs
- preserve place IDs and provider attribution
- do not store provider-generated summary text without its provenance/disclosure contract
- verify current Google docs before copying request-property names or billing assumptions
