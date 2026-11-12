#!/usr/bin/env node
/**
 * Verify maps-related env vars (names + live probes). Never prints secret values.
 * Usage: node --env-file=.env.local scripts/verify-maps-env.mjs
 */
const errors = [];
const warnings = [];

const mapsKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
const mapId = process.env.NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID;
// Mirror requirePlacesApiKey() in the server Places client. Keep this probe on
// the exact credential used by production rather than a legacy browser key.
const placesKeyOptions = [
  ["GOOGLE_MAPS_SERVER_API_KEY", process.env.GOOGLE_MAPS_SERVER_API_KEY],
  ["GOOGLE_PLACES_API_KEY", process.env.GOOGLE_PLACES_API_KEY],
  ["GOOGLE_MAPS_API_KEY", process.env.GOOGLE_MAPS_API_KEY],
];
const selectedPlacesKey = placesKeyOptions.find(
  ([, value]) => typeof value === "string" && value.trim().length >= 8,
);
const placesKey = selectedPlacesKey?.[1]?.trim();
const placesKeyName = selectedPlacesKey?.[0] ?? "GOOGLE_MAPS_SERVER_API_KEY";
const geminiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY;

function mask(v) {
  if (!v || v.length < 8) return "(missing or too short)";
  return `${v.slice(0, 6)}…${v.slice(-4)} (${v.length} chars)`;
}

if (!mapsKey) {
  errors.push("missing NEXT_PUBLIC_GOOGLE_MAPS_API_KEY (Maps JS / vis.gl)");
} else if (!mapsKey.startsWith("AIza")) {
  warnings.push("NEXT_PUBLIC_GOOGLE_MAPS_API_KEY does not look like a Google API key prefix");
}

if (!mapId) {
  const prodLike =
    process.env.NODE_ENV === "production" ||
    process.env.VERCEL_ENV === "production" ||
    process.env.VERCEL_ENV === "preview" ||
    process.env.VERIFY_MAPS_PRODUCTION === "1";
  if (prodLike) {
    errors.push(
      "missing NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID — required in production/preview (MAP-008); never DEMO_MAP_ID",
    );
  } else {
    warnings.push(
      "missing NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID — dev falls back to DEMO_MAP_ID only",
    );
  }
} else if (mapId.length < 8) {
  warnings.push("NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID looks too short");
} else if (mapId === "DEMO_MAP_ID") {
  errors.push("NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID must not be DEMO_MAP_ID in env");
}

if (!geminiKey) {
  errors.push("missing GOOGLE_GENERATIVE_AI_API_KEY (Mastra concierge)");
}

if (process.env.NEXT_PUBLIC_GOOGLE_PLACES_API_KEY) {
  errors.push(
    "remove NEXT_PUBLIC_GOOGLE_PLACES_API_KEY — use GOOGLE_PLACES_API_KEY server-only (MAP-013)",
  );
}

if (!process.env.ADK_GROUNDING_URL) {
  warnings.push("missing ADK_GROUNDING_URL — default http://localhost:8000 for MAP-002");
}

if (!placesKey) {
  warnings.push(
    "missing GOOGLE_MAPS_SERVER_API_KEY / GOOGLE_PLACES_API_KEY / GOOGLE_MAPS_API_KEY — required for Places API (New) calls",
  );
}

if (process.env.GEMINI_API_KEY && geminiKey && process.env.GEMINI_API_KEY !== geminiKey) {
  warnings.push("GEMINI_API_KEY differs from GOOGLE_GENERATIVE_AI_API_KEY — prefer single Gemini key");
}

// Live probe: Geocoding (validates Maps-related key billing)
async function probeGeocode() {
  if (!mapsKey) return;
  const url = new URL("https://maps.googleapis.com/maps/api/geocode/json");
  url.searchParams.set("address", "Medellin, Colombia");
  url.searchParams.set("key", mapsKey);
  const res = await fetch(url);
  const body = await res.json();
  if (body.status === "OK" || body.status === "ZERO_RESULTS") {
    console.log("✅ Geocoding probe:", body.status);
    return;
  }
  if (
    body.status === "REQUEST_DENIED" &&
    /referer restrictions/i.test(body.error_message ?? "")
  ) {
    console.log(
      "✅ Maps JS key is referrer-restricted (expected) — use in browser only, not Geocoding API",
    );
    return;
  }
  errors.push(
    `Geocoding probe failed: ${body.status} — ${body.error_message ?? "no message"}`,
  );
}

async function probePlacesKey() {
  if (!placesKey) return;
  const url = "https://places.googleapis.com/v1/places:searchText";
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": placesKey,
      "X-Goog-FieldMask": "places.id,places.displayName",
    },
    body: JSON.stringify({
      textQuery: "cafe Laureles Medellin",
      pageSize: 1,
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    if (
      res.status === 403 &&
      /referer/i.test(text)
    ) {
      warnings.push(
        `${placesKeyName} has HTTP referrer restriction — use a correctly restricted server-side key for Places API (New)`,
      );
      return;
    }
    if (res.status === 403) {
      warnings.push(
        `Places API probe HTTP 403 (DATA-008) — not a MAP-008B Map ID blocker: ${text.slice(0, 80)}`,
      );
      return;
    }
    errors.push(`Places API probe HTTP ${res.status}: ${text.slice(0, 120)}`);
    return;
  }
  console.log("✅ Places API (New) searchText probe: HTTP", res.status);
}

// Compare repo root Places key presence (F04 mapping hint)
async function main() {
  console.log("Maps env check (.env.local)\n");
  console.log("NEXT_PUBLIC_GOOGLE_MAPS_API_KEY:", mask(mapsKey));
  console.log("NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID:", mapId ?? "(missing)");
  console.log("GOOGLE_GENERATIVE_AI_API_KEY:", mask(geminiKey));
  console.log("Places API key selected:", placesKeyName, placesKey ? "(configured)" : "(missing)");

  await probeGeocode();
  await probePlacesKey();

  if (warnings.length) {
    console.log("\nWarnings:");
    for (const w of warnings) console.log("  ⚠", w);
  }
  if (errors.length) {
    console.log("\nErrors:");
    for (const e of errors) console.log("  ✗", e);
    process.exit(1);
  }
  console.log("\n✅ Maps env OK (MAP-001 / F48 / F49 / MAP-008 mapId)");
  console.log(
    "\nBrowser key HTTP referrers (GCP → Credentials → Maps JS key):",
  );
  for (const r of [
    "http://localhost:3001/*",
    "http://localhost:3000/*",
    "http://127.0.0.1:3001/*",
    "http://127.0.0.1:3000/*",
  ]) {
    console.log("  •", r);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
