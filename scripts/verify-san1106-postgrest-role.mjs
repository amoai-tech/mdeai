#!/usr/bin/env node
/**
 * Opt-in LOCAL HTTP smoke test: PostgREST JWT validation -> SET ROLE ->
 * SECURITY DEFINER publish_verified_rental authorization.
 *
 * Set LOCAL_SUPABASE_CONFIG_DIR to a running isolated CLI project, or
 * supply LOCAL_SUPABASE_URL / LOCAL_SUPABASE_ANON_KEY /
 * LOCAL_SUPABASE_SERVICE_ROLE_KEY and optionally LOCAL_SUPABASE_SECRET_KEY.
 * Never writes or publishes a rental; refuses non-loopback hosts.
 */
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";

function localCliEnv() {
  if (!process.env.LOCAL_SUPABASE_CONFIG_DIR) return {};
  const output = execFileSync("supabase", ["status", "-o", "env"], {
    cwd: process.env.LOCAL_SUPABASE_CONFIG_DIR,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  });
  return Object.fromEntries(
    output.split("\n").filter((line) => /^[A-Z_]+=/u.test(line)).map((line) => {
      const idx = line.indexOf("=");
      return [line.slice(0, idx), line.slice(idx + 1).trim().replace(/^["']|["']$/gu, "")];
    }),
  );
}
const localEnv = localCliEnv();

const url = new URL(process.env.LOCAL_SUPABASE_URL ?? localEnv.API_URL ?? "http://invalid.invalid");
assert.ok(["127.0.0.1", "localhost", "::1", "[::1]"].includes(url.hostname),
  "This test only supports an isolated localhost Supabase instance");
const serviceJwt = process.env.LOCAL_SUPABASE_SERVICE_ROLE_KEY ?? localEnv.SERVICE_ROLE_KEY;
const anonJwt = process.env.LOCAL_SUPABASE_ANON_KEY ?? localEnv.ANON_KEY;
assert.ok(serviceJwt && anonJwt, "Local service_role and anon JWTs are required");

const endpoint = new URL("/rest/v1/rpc/publish_verified_rental", url);
const payload = JSON.stringify({
  p_apartment_id: "ffffffff-ffff-4fff-8fff-ffffffffffff",
  p_actor_id: "00000000-0000-4000-8000-000000000001",
});

async function call(label, apikey, bearer) {
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      apikey,
      ...(bearer ? { Authorization: "Bearer " + bearer } : {}),
      "Content-Type": "application/json",
    },
    body: payload,
    signal: AbortSignal.timeout(10_000),
  });
  const result = await response.json();
  console.log(label + ": HTTP " + response.status + ", code " + (result.code ?? "none"));
  return { status: response.status, code: result.code };
}

// P0002 originates inside the function, AFTER its role authorization check.
// The absent UUID prevents any publication.
const trusted = await call("signed service JWT", serviceJwt, serviceJwt);
assert.equal(trusted.code, "P0002", "PostgREST service_role must reach the function");

// A corrupted signed JWT must fail BEFORE PostgREST invokes SQL.
const parts = serviceJwt.split(".");
assert.equal(parts.length, 3, "Expected legacy signed service_role JWT");
parts[2] = (parts[2][0] === "A" ? "B" : "A") + parts[2].slice(1);
const invalid = await call("invalid JWT signature", anonJwt, parts.join("."));
assert.equal(invalid.status, 401, "JWT verification must reject invalid signature");

const anonymous = await call("anonymous JWT", anonJwt, anonJwt);
assert.ok(
  [401, 403].includes(anonymous.status) && anonymous.code !== "P0002",
  "Anonymous requests must not reach privileged publisher",
);

// Modern sb_secret_ keys map to the PostgreSQL service_role without a
// service_role JWT in the Authorization header.
const modernSecret = process.env.LOCAL_SUPABASE_SECRET_KEY ?? localEnv.SECRET_KEY;
if (modernSecret) {
  const modern = await call("modern secret apikey", modernSecret);
  assert.equal(modern.code, "P0002", "Modern backend secret key must map to service_role");
}

console.log("SAN-1106 PostgREST role/JWT boundary: PASS");
