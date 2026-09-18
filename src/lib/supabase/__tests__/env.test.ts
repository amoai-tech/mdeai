import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { getSupabaseEnv } from "../env";

/**
 * `getSupabaseEnv()` feeds the browser client, the proxy/middleware session
 * refresh and every SSR Supabase call, and it *throws* when credentials are
 * missing. `??` only skips `null`/`undefined`, so a blank publishable key used to
 * be returned verbatim and throw — even when the legacy public anon key was
 * configured. These tests pin the blank-skipping behaviour.
 */
const PUBLIC_URL = "https://public.supabase.co";
const PUBLISHABLE = "sb_publishable_test";
const LEGACY_ANON = "legacy-anon-jwt";

const MANAGED = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
] as const;

const env = process.env as Record<string, string | undefined>;
const saved = new Map<string, string | undefined>();

beforeEach(() => {
  saved.clear();
  for (const name of MANAGED) {
    saved.set(name, env[name]);
    delete env[name];
  }
});

afterEach(() => {
  for (const [name, value] of saved) {
    if (value === undefined) delete env[name];
    else env[name] = value;
  }
});

describe("getSupabaseEnv", () => {
  it("returns the publishable key when both keys are present", () => {
    env.NEXT_PUBLIC_SUPABASE_URL = PUBLIC_URL;
    env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = PUBLISHABLE;
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY = LEGACY_ANON;
    expect(getSupabaseEnv()).toEqual({ url: PUBLIC_URL, anonKey: PUBLISHABLE });
  });

  it("falls back to the legacy anon key when the publishable key is blank", () => {
    env.NEXT_PUBLIC_SUPABASE_URL = PUBLIC_URL;
    env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = "";
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY = LEGACY_ANON;
    expect(getSupabaseEnv()).toEqual({ url: PUBLIC_URL, anonKey: LEGACY_ANON });
  });

  it("falls back through a whitespace-only publishable key", () => {
    env.NEXT_PUBLIC_SUPABASE_URL = PUBLIC_URL;
    env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = "   ";
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY = LEGACY_ANON;
    expect(getSupabaseEnv()).toEqual({ url: PUBLIC_URL, anonKey: LEGACY_ANON });
  });

  it("throws when the url is blank rather than using a blank url", () => {
    env.NEXT_PUBLIC_SUPABASE_URL = "";
    env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = PUBLISHABLE;
    expect(() => getSupabaseEnv()).toThrow(/Missing NEXT_PUBLIC_SUPABASE_URL/);
  });

  it("throws when every key candidate is blank", () => {
    env.NEXT_PUBLIC_SUPABASE_URL = PUBLIC_URL;
    env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = "";
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "  ";
    expect(() => getSupabaseEnv()).toThrow();
  });

  it("trims surrounding whitespace from usable values", () => {
    env.NEXT_PUBLIC_SUPABASE_URL = ` ${PUBLIC_URL} `;
    env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = `\t${PUBLISHABLE}\n`;
    expect(getSupabaseEnv()).toEqual({ url: PUBLIC_URL, anonKey: PUBLISHABLE });
  });
});
