import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  firstPresent,
  getSupabaseServerAnonEnv,
  getSupabaseServerAnonKey,
  getSupabaseServerUrl,
} from "../server-env";
import { getSupabaseServiceEnv } from "../service-env";

/**
 * MDE-ENV-002 (SAN-1333) — the server must accept the variable names Vercel
 * actually injects.
 *
 * Production only has `NEXT_PUBLIC_SUPABASE_URL` + `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`;
 * there is no bare `SUPABASE_URL`. Before this contract existed, every concierge
 * tool returned a `null` client and served fixture data behind HTTP 200.
 *
 * The resolvers use `??`, so "unset" must mean deleted — an empty string would
 * (correctly) be treated as present.
 */

const SERVER_URL = "https://server-only.supabase.co";
const PUBLIC_URL = "https://public.supabase.co";
const SERVER_ANON = "server-anon-key";
const PUBLISHABLE = "sb_publishable_test";
const LEGACY_ANON = "legacy-anon-jwt";
const SERVICE_ROLE = "service-role-key";
const SECRET_KEY = "sb_secret_test";

/** Every name these resolvers read, removed so each case starts from nothing. */
const MANAGED = [
  "SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_URL",
  "SUPABASE_ANON_KEY",
  "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "SUPABASE_SECRET_KEY",
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

describe("getSupabaseServerUrl", () => {
  it("prefers the server-only name when both are present", () => {
    env.SUPABASE_URL = SERVER_URL;
    env.NEXT_PUBLIC_SUPABASE_URL = PUBLIC_URL;
    expect(getSupabaseServerUrl()).toBe(SERVER_URL);
  });

  it("falls back to NEXT_PUBLIC_SUPABASE_URL — the production configuration", () => {
    env.NEXT_PUBLIC_SUPABASE_URL = PUBLIC_URL;
    expect(getSupabaseServerUrl()).toBe(PUBLIC_URL);
  });

  it("returns undefined when neither name is set", () => {
    expect(getSupabaseServerUrl()).toBeUndefined();
  });
});

describe("getSupabaseServerAnonKey", () => {
  it("prefers SUPABASE_ANON_KEY", () => {
    env.SUPABASE_ANON_KEY = SERVER_ANON;
    env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = PUBLISHABLE;
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY = LEGACY_ANON;
    expect(getSupabaseServerAnonKey()).toBe(SERVER_ANON);
  });

  it("falls back to the publishable key, then the legacy anon JWT", () => {
    env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = PUBLISHABLE;
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY = LEGACY_ANON;
    expect(getSupabaseServerAnonKey()).toBe(PUBLISHABLE);

    delete env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
    expect(getSupabaseServerAnonKey()).toBe(LEGACY_ANON);
  });

  it("returns undefined when no key name is set", () => {
    expect(getSupabaseServerAnonKey()).toBeUndefined();
  });
});

describe("getSupabaseServerAnonEnv", () => {
  it("resolves the exact production shape — only NEXT_PUBLIC_* is injected", () => {
    env.NEXT_PUBLIC_SUPABASE_URL = PUBLIC_URL;
    env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = PUBLISHABLE;
    expect(getSupabaseServerAnonEnv()).toEqual({
      url: PUBLIC_URL,
      anonKey: PUBLISHABLE,
    });
  });

  it("returns null when the url is missing but the key is present", () => {
    env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = PUBLISHABLE;
    expect(getSupabaseServerAnonEnv()).toBeNull();
  });

  it("returns null when the key is missing but the url is present", () => {
    env.NEXT_PUBLIC_SUPABASE_URL = PUBLIC_URL;
    expect(getSupabaseServerAnonEnv()).toBeNull();
  });

  it("returns null when nothing is set", () => {
    expect(getSupabaseServerAnonEnv()).toBeNull();
  });
});

describe("getSupabaseServiceEnv", () => {
  it("shares the url fallback with the anon resolver", () => {
    env.NEXT_PUBLIC_SUPABASE_URL = PUBLIC_URL;
    env.SUPABASE_SERVICE_ROLE_KEY = SERVICE_ROLE;
    expect(getSupabaseServiceEnv()).toEqual({
      url: PUBLIC_URL,
      serviceRoleKey: SERVICE_ROLE,
    });
  });

  it("falls back to SUPABASE_SECRET_KEY for the privileged key", () => {
    env.NEXT_PUBLIC_SUPABASE_URL = PUBLIC_URL;
    env.SUPABASE_SECRET_KEY = SECRET_KEY;
    expect(getSupabaseServiceEnv()).toEqual({
      url: PUBLIC_URL,
      serviceRoleKey: SECRET_KEY,
    });
  });

  it("falls through a blank privileged key", () => {
    env.NEXT_PUBLIC_SUPABASE_URL = PUBLIC_URL;
    env.SUPABASE_SERVICE_ROLE_KEY = "";
    env.SUPABASE_SECRET_KEY = SECRET_KEY;
    expect(getSupabaseServiceEnv()).toEqual({
      url: PUBLIC_URL,
      serviceRoleKey: SECRET_KEY,
    });
  });
});

/**
 * Regression: a Sensitive Vercel variable can be present with an EMPTY value, and
 * `"" ?? fallback` returns `""`. The first version of this module used `??`, so an
 * empty `SUPABASE_ANON_KEY` stopped the chain before the inlined publishable key
 * and production kept serving fixtures behind HTTP 200.
 */
describe("blank and whitespace values count as absent", () => {
  it("falls through an empty SUPABASE_ANON_KEY to the publishable key", () => {
    env.SUPABASE_ANON_KEY = "";
    env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = PUBLISHABLE;
    expect(getSupabaseServerAnonKey()).toBe(PUBLISHABLE);
  });

  it("falls through a whitespace-only SUPABASE_ANON_KEY", () => {
    env.SUPABASE_ANON_KEY = "   ";
    env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = PUBLISHABLE;
    expect(getSupabaseServerAnonKey()).toBe(PUBLISHABLE);
  });

  it("falls through an empty SUPABASE_URL to the public url", () => {
    env.SUPABASE_URL = "";
    env.NEXT_PUBLIC_SUPABASE_URL = PUBLIC_URL;
    expect(getSupabaseServerUrl()).toBe(PUBLIC_URL);
  });

  it("resolves the exact production shape: blank sensitive names, public Config present", () => {
    // Vercel: SUPABASE_ANON_KEY present but empty; NEXT_PUBLIC_* inlined literals.
    env.SUPABASE_URL = "";
    env.SUPABASE_ANON_KEY = "";
    env.NEXT_PUBLIC_SUPABASE_URL = PUBLIC_URL;
    env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = PUBLISHABLE;
    expect(getSupabaseServerAnonEnv()).toEqual({ url: PUBLIC_URL, anonKey: PUBLISHABLE });
  });

  it("trims surrounding whitespace from a usable value", () => {
    env.NEXT_PUBLIC_SUPABASE_URL = PUBLIC_URL;
    env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = `  ${PUBLISHABLE}  `;
    expect(getSupabaseServerAnonEnv()).toEqual({ url: PUBLIC_URL, anonKey: PUBLISHABLE });
  });

  it("firstPresent skips blanks and returns undefined when all are blank", () => {
    expect(firstPresent("", "  ", undefined, "value")).toBe("value");
    expect(firstPresent("", "   ", undefined)).toBeUndefined();
  });
});
