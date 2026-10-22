import assert from "node:assert/strict";
import { test } from "node:test";
import { auditWithRetry, classifyAudit } from "../audit-floor-retry.mjs";

const report = (critical) => JSON.stringify({ metadata: { vulnerabilities: { info: 0, low: 0, moderate: 0, high: 2, critical } } });
const good = { status: 0, stdout: report(0) };
const outage = { status: 1, stdout: JSON.stringify({ error: { code: "E503", summary: "503 Service Unavailable" } }) };

test("passes only a complete report with zero critical vulnerabilities", () => {
  assert.equal(classifyAudit(good).kind, "pass");
  assert.equal(classifyAudit({ status: 0, stdout: "{}" }).kind, "failure");
  assert.equal(classifyAudit({ status: 0, stdout: "" }).kind, "failure");
});

test("rejects known critical vulnerabilities immediately", async () => {
  let calls = 0;
  await assert.rejects(auditWithRetry({ invoke: () => { calls++; return { status: 1, stdout: report(1) }; }, sleep: async () => {} }), /critical vulnerabilities/);
  assert.equal(calls, 1);
});

test("retries transient 503 and passes a subsequent complete report", async () => {
  let calls = 0;
  const result = await auditWithRetry({ invoke: () => ++calls === 1 ? outage : good, sleep: async () => {} });
  assert.equal(result.kind, "pass");
  assert.equal(calls, 2);
});

test("fails closed when registry stays unavailable", async () => {
  let calls = 0;
  await assert.rejects(auditWithRetry({ invoke: () => { calls++; return outage; }, sleep: async () => {} }), /registry unavailable after 3 attempts/);
  assert.equal(calls, 3);
});

test("never retries missing-lockfile errors or malformed reports", async () => {
  let calls = 0;
  await assert.rejects(auditWithRetry({ invoke: () => { calls++; return { status: 1, stdout: '{"error":{"code":"EAUDITNOLOCK"}}' }; }, sleep: async () => {} }), /no complete vulnerability report/);
  assert.equal(calls, 1);
});

test("timeouts are retriable but not clean audit evidence", () => {
  assert.equal(classifyAudit({ status: null, error: Object.assign(new Error("timeout"), { code: "ETIMEDOUT" }) }).kind, "transient");
});

test("rejects nonzero exit even when zero critical vulnerabilities is reported", () => {
  assert.equal(classifyAudit({ status: 1, stdout: report(0) }).kind, "failure");
});
