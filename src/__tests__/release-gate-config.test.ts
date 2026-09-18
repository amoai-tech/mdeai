/// <reference types="vite/client" />
import { describe, it, expect } from "vitest";

/**
 * SAN-1330 — the production build must not be allowed to skip type checking.
 *
 * Vercel only runs `npm run build`, while Floor runs `typecheck` as a separate
 * step. So `typescript.ignoreBuildErrors: true` meant a type regression could
 * reach production with every CI signal green — the same "READY but broken"
 * shape as SAN-1322.
 *
 * Verified removable on 2026-09-18: with the flag gone the production build logs
 * `Running TypeScript ... Finished TypeScript in 9.5s ...` and exits 0, so the
 * old "@mastra/memory beta types are unstable" justification is stale.
 */
/** Raw config text via Vite's glob — no filesystem access, no dynamic path. */
const CONFIG_SOURCES = import.meta.glob("/next.config.ts", {
  query: "?raw",
  import: "default",
  eager: true,
}) as Record<string, string>;
const rawConfig = Object.values(CONFIG_SOURCES)[0];
if (typeof rawConfig !== "string") throw new Error("next.config.ts source not found");

/** Strip comments so explanatory prose about the old flag is not matched. */
const config = rawConfig
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .replace(/(^|[^:])\/\/.*$/gm, "$1");

describe("release gate — production build type checking", () => {
  it("does not let the production build ignore type errors", () => {
    expect(config).not.toMatch(/ignoreBuildErrors\s*:\s*true/);
  });

  it("states the intent explicitly rather than relying on the default", () => {
    expect(config).toMatch(/ignoreBuildErrors\s*:\s*false/);
  });

  it("does not let the production build ignore lint errors either", () => {
    expect(config).not.toMatch(/ignoreDuringBuilds\s*:\s*true/);
  });
});
