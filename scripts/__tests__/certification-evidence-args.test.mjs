import assert from "node:assert/strict";
import { test } from "node:test";
import { parseCertificationEvidenceArgs } from "../lib/certification-evidence-args.mjs";

const BASE = [
  "--apartment-id=750e8400-e29b-41d4-a716-446655440001",
  "--checked-at=2026-10-06T12:00:00Z",
  "--freshness-status=active",
  "--confirm-write=true",
];

test("accepts a complete, confirmed invocation", () => {
  const parsed = parseCertificationEvidenceArgs(BASE);
  assert.equal(parsed.ok, true, parsed.errors.join("; "));
});

test("refuses to write without --confirm-write=true", () => {
  const parsed = parseCertificationEvidenceArgs(BASE.filter((a) => !a.startsWith("--confirm-write")));
  assert.equal(parsed.ok, false);
  assert.match(parsed.errors.join(" "), /confirm-write/);
});

test("refuses an unsupported freshness status", () => {
  const parsed = parseCertificationEvidenceArgs([
    ...BASE.filter((a) => !a.startsWith("--freshness-status")),
    "--freshness-status=fresh",
  ]);
  assert.equal(parsed.ok, false);
  assert.match(parsed.errors.join(" "), /freshness-status/);
});

test("refuses a non-UUID apartment id and an unparseable timestamp", () => {
  const parsed = parseCertificationEvidenceArgs([
    "--apartment-id=nope",
    "--checked-at=not-a-date",
    "--freshness-status=active",
    "--confirm-write=true",
  ]);
  assert.equal(parsed.ok, false);
  assert.ok(parsed.errors.length >= 2);
});

test("parses optional evidence fields", () => {
  const parsed = parseCertificationEvidenceArgs([
    ...BASE,
    "--image-url=https://example.com/a.jpg",
    "--source-type=listing",
    "--source-url=https://example.com/listing",
    "--verification-status=verified",
    "--verified-by=750e8400-e29b-41d4-a716-446655440002",
    "--notes=checked with owner",
  ]);
  assert.equal(parsed.ok, true, parsed.errors.join("; "));
  assert.equal(parsed.value.imageUrl, "https://example.com/a.jpg");
  assert.equal(parsed.value.verificationStatus, "verified");
});

test("refuses each missing required argument", () => {
  for (const flag of ["--apartment-id", "--checked-at", "--freshness-status"]) {
    const parsed = parseCertificationEvidenceArgs(BASE.filter((a) => !a.startsWith(flag)));
    assert.equal(parsed.ok, false, `missing ${flag} must be refused`);
  }
});

test("refuses a non-UUID --verified-by", () => {
  const parsed = parseCertificationEvidenceArgs([...BASE, "--verification-status=verified", "--verified-by=not-a-uuid"]);
  assert.equal(parsed.ok, false);
  assert.match(parsed.errors.join(" "), /verified-by/);
});

test("refuses malformed evidence URLs", () => {
  assert.equal(parseCertificationEvidenceArgs([...BASE, "--image-url=not-a-url"]).ok, false);
  assert.equal(parseCertificationEvidenceArgs([...BASE, "--source-type=listing", "--source-url=javascript:alert(1)"]).ok, false);
});

test("does not treat --database-url as a certification argument", () => {
  const parsed = parseCertificationEvidenceArgs([...BASE, "--database-url=postgresql://example/db"]);
  assert.equal(parsed.ok, true, parsed.errors.join("; "));
  assert.equal(parsed.value.databaseUrl, undefined);
});
