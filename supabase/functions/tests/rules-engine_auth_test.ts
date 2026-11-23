import { strict as assert } from "node:assert";
import { checkRulesEngineAuth } from "../_shared/rules-engine-secret.ts";

Deno.test("rules engine refuses all requests without configured service secret", () => {
  const credential = new Headers({ "x-rules-engine-secret": "supplied-secret" });
  assert.equal(checkRulesEngineAuth(credential, undefined)?.status, 503);
  assert.equal(checkRulesEngineAuth(credential, "")?.status, 503);
  assert.equal(checkRulesEngineAuth(credential, "   ")?.status, 503);
});

Deno.test("rules engine rejects missing or invalid service credentials", () => {
  assert.equal(checkRulesEngineAuth(new Headers(), "expected-secret")?.status, 401);
  assert.equal(checkRulesEngineAuth(new Headers({ Authorization: "Bearer" }), "expected-secret")?.status, 401);
  assert.equal(checkRulesEngineAuth(new Headers({ "x-rules-engine-secret": "wrong" }), "expected-secret")?.status, 403);
});

Deno.test("rules engine allows exactly matching internal header or bearer secret", () => {
  assert.equal(checkRulesEngineAuth(new Headers({ "x-rules-engine-secret": "expected-secret" }), "expected-secret"), null);
  assert.equal(checkRulesEngineAuth(new Headers({ Authorization: "Bearer expected-secret" }), "expected-secret"), null);
});

Deno.test("rules engine does not trust a valid Bearer if a conflicting explicit secret is provided", () => {
  assert.equal(checkRulesEngineAuth(new Headers({
    "x-rules-engine-secret": "wrong",
    Authorization: "Bearer expected-secret",
  }), "expected-secret")?.status, 403);
});
