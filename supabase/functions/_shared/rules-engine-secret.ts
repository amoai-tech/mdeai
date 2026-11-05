import { timingSafeEqual } from "./crypto.ts";

/** Extract the internal rules-engine credential, never a Supabase publishable key. */
export function extractRulesEngineSecretCandidate(headers: Headers): string {
  const hdr = headers.get("x-rules-engine-secret");
  if (hdr != null && hdr.length > 0) return hdr.trim();
  const auth = headers.get("Authorization");
  if (auth?.match(/^Bearer\s+/i)) return auth.replace(/^Bearer\s+/i, "").trim();
  return "";
}

export type RulesEngineAuthFailure = {
  status: 401 | 403 | 503;
  error: "Unauthorized" | "Forbidden" | "CONFIG_ERROR";
  message: string;
};

/**
 * Internal functions must fail closed if their required secret was not set.
 * Return null only for an authenticated service caller.
 */
export function checkRulesEngineAuth(
  headers: Headers,
  configuredSecret: string | null | undefined,
): RulesEngineAuthFailure | null {
  if (!configuredSecret?.trim()) {
    return {
      status: 503,
      error: "CONFIG_ERROR",
      message: "Rules engine credentials are not configured",
    };
  }
  const provided = extractRulesEngineSecretCandidate(headers);
  if (!provided) {
    return {
      status: 401,
      error: "Unauthorized",
      message: "Missing rules engine credentials",
    };
  }
  if (!timingSafeEqual(provided, configuredSecret)) {
    return {
      status: 403,
      error: "Forbidden",
      message: "Invalid rules engine credentials",
    };
  }
  return null;
}
