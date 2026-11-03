import { describe, expect, it } from "vitest";
import { isQaEventFixture, NON_QA_EVENT_SLUG_FILTER, QA_EVENT_NAME_SQL_PATTERN } from "../public-event-fixtures";

describe("public event fixtures — explicit QA markers only", () => {
  it.each([
    { name: "QA SAN-896 approve 1234", slug: "qa-san-896-approve-1234" },
    { name: "[QA DELETE] Sales Proof", slug: "qa-analytics-sample-sales-proof" },
    { name: "[QA DEMO] Salsa Sunset", slug: null },
    { name: "Real-looking test title", slug: "qa-hidden-fixture" },
    { name: "TEST: Event checkout", slug: null },
  ])("hides labelled development fixture $name", (row) => {
    expect(isQaEventFixture(row)).toBe(true);
  });

  it.each([
    { name: "Reina de Antioquia 2026 Finals", slug: "reina-de-antioquia-2026-finals" },
    { name: "Feria de las Flores", slug: null },
    { name: "Quality of Life Festival", slug: "quality-fest" },
    { name: "Testament Live", slug: "testament-live" },
    { name: "Salsa QA Workshop", slug: "salsa-qa-workshop" },
  ])("keeps ordinary published event $name", (row) => {
    expect(isQaEventFixture(row)).toBe(false);
  });

  it("excludes slug QA while preserving NULL slugs in PostgREST", () => {
    expect(NON_QA_EVENT_SLUG_FILTER).toContain("slug.is.null");
    expect(NON_QA_EVENT_SLUG_FILTER).toContain("slug.not.ilike.qa-*");
    expect(QA_EVENT_NAME_SQL_PATTERN).toContain("qa|test");
  });
});
