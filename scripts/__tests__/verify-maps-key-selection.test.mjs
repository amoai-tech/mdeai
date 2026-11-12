import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";

const fakeKeys = {
  GOOGLE_MAPS_SERVER_API_KEY: "AIza-server-for-tests-only",
  GOOGLE_PLACES_API_KEY: "AIza-browser-for-tests-only",
  GOOGLE_MAPS_API_KEY: "AIza-legacy-for-tests-only",
};

const probe = `
globalThis.fetch = async (url, options = {}) => {
  if (String(url).includes("places.googleapis.com")) {
    if (options.headers?.["X-Goog-Api-Key"] !== process.env.EXPECTED_SELECTED_KEY) {
      throw Error("Maps probe selected a different Places API key from the server runtime");
    }
    return { ok: true, status: 200 };
  }
  return { json: async () => ({ status: "OK" }) };
};
await import("./scripts/verify-maps-env.mjs");
`;

for (const [name, overrides, selectedName] of [
  ["server key takes precedence over browser key", {}, "GOOGLE_MAPS_SERVER_API_KEY"],
  ["legacy server-only key is used when dedicated server key is absent", { GOOGLE_MAPS_SERVER_API_KEY: "" }, "GOOGLE_PLACES_API_KEY"],
]) {
  test(name, () => {
    const env = {
      PATH: process.env.PATH ?? "",
      NODE_ENV: "test",
      NEXT_PUBLIC_GOOGLE_MAPS_API_KEY: "AIza-browser-maps-test",
      NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID: "maps-id-for-test",
      GOOGLE_GENERATIVE_AI_API_KEY: "AIza-gemini-test",
      ...fakeKeys,
      ...overrides,
    };
    env.EXPECTED_SELECTED_KEY = env[selectedName];
    const result = spawnSync(process.execPath, ["--input-type=module", "--eval", probe], {
      cwd: process.cwd(),
      encoding: "utf8",
      env,
    });
    assert.equal(result.status, 0, result.stderr || result.stdout);
    assert.match(result.stdout, new RegExp(`Places API key selected: ${selectedName} \\(configured\\)`));
    assert.match(result.stdout, /Places API \\(New\\) searchText probe: HTTP 200/);
    assert.doesNotMatch(result.stdout, /AIza-server-for-tests-only/);
  });
}
