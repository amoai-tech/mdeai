/**
 * Trusted, read-only QA credential preflight. Never print values or tokens.
 * Reuse the E2E helper's canonical environment validation.
 */
import { hasE2eEnv, loadEnvLocalForE2E } from "../e2e/helpers/auth";

loadEnvLocalForE2E();
if (!hasE2eEnv()) {
  const publicKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const adminKey = process.env.SUPABASE_SERVICE_ROLE_KEY ??
    process.env.SUPABASE_SECRET_KEY;
  const missing = [
    !process.env.NEXT_PUBLIC_SUPABASE_URL && "NEXT_PUBLIC_SUPABASE_URL",
    !publicKey && "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY (or NEXT_PUBLIC_SUPABASE_ANON_KEY)",
    !adminKey && "SUPABASE_SERVICE_ROLE_KEY (or SUPABASE_SECRET_KEY)",
  ].filter(Boolean);
  console.error(
    "MDE QA auth: FAIL — " +
      (missing.length ? "missing " + missing.join(", ") : "invalid QA backend configuration") +
      ". Check ignored .env.local or trusted CI environment; values are never displayed.",
  );
  process.exitCode = 1;
} else {
  console.log("MDE QA auth: PASS — existing Supabase test configuration is present and valid in shape. No secrets displayed.");
}
