/**
 * The #386 regression was a peso monthly budget silently sent as a $2 nightly cap.
 * The smoke must prove the request shape, not just that the page printed a sentence.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { classifyMonthlyBudgetRequest, disclosureMatches } from "../prod-behaviour-smoke.mjs";

test("accepts the real monthly payload for a 2-million-peso query", () => {
  const result = classifyMonthlyBudgetRequest({
    neighborhood: "Laureles",
    minBedrooms: 2,
    stayType: "monthly",
    maxPriceMonthly: 2_000_000,
    budgetCurrency: "COP",
  });
  assert.equal(result.ok, true);
  assert.match(result.detail, /maxPriceMonthly/);
});

const VALID = { maxPriceMonthly: 2_000_000, budgetCurrency: "COP", stayType: "monthly" };

test("rejects the historic $2/night cap", () => {
  const result = classifyMonthlyBudgetRequest({
    ...VALID,
    maxPriceMonthly: undefined,
    maxPricePerNight: 2,
  });
  assert.equal(result.ok, false);
});

test("rejects a payload that sends both a monthly and a nightly ceiling", () => {
  const result = classifyMonthlyBudgetRequest({ ...VALID, maxPricePerNight: 2 });
  assert.equal(result.ok, false);
});

test("rejects a string amount, a near miss, or the wrong monthly amount", () => {
  assert.equal(classifyMonthlyBudgetRequest({ ...VALID, maxPriceMonthly: "2000000" }).ok, false);
  assert.equal(classifyMonthlyBudgetRequest({ ...VALID, maxPriceMonthly: 2_000 }).ok, false);
  assert.equal(classifyMonthlyBudgetRequest({ ...VALID, maxPriceMonthly: 2_000_000.5 }).ok, false);
});

test("disclosure must name the expected currency and amount", () => {
  const text = "No rentals match. Applied budget: COP 2,000,000 per month.";
  assert.equal(disclosureMatches(text, 2_000_000, "COP"), true);
  assert.equal(disclosureMatches(text, 2_000_000, "USD"), false);
  assert.equal(disclosureMatches(text, 2_100_000, "COP"), false);
  assert.equal(disclosureMatches("Applied budget: COP 2,000,000 per month", 2_000_000, "COP"), true);
  assert.equal(disclosureMatches("I can't filter by monthly budget yet.", 2_000_000, "COP"), false);
  assert.equal(disclosureMatches("budget was not applied", 2_000_000, "COP"), false);
  assert.equal(disclosureMatches("monthly budget on cards", 2_000_000, "COP"), false);
});

test("a nightly wording cannot satisfy the monthly disclosure gate", () => {
  assert.equal(disclosureMatches("Applied budget: COP 2,000,000 per night", 2_000_000, "COP"), false);
  assert.equal(disclosureMatches("Applied budget: COP 2,000,000 per month.", 2_000_000, "COP"), true);
  assert.equal(disclosureMatches("Applied budget: COP 2,000,000 per month.\n\nFound 2 rentals", 2_000_000, "COP"), true);
  assert.equal(disclosureMatches("Applied budget: COP 2,000,000 per month.\n 2BR Laureles", 2_000_000, "COP"), true);
});

test("requires COP and a monthly stay type, not just the right amount", () => {
  const base = { maxPriceMonthly: 2_000_000, budgetCurrency: "COP", stayType: "monthly" };
  assert.equal(classifyMonthlyBudgetRequest(base).ok, true);
  assert.equal(classifyMonthlyBudgetRequest({ ...base, budgetCurrency: "USD" }).ok, false);
  assert.equal(classifyMonthlyBudgetRequest({ ...base, stayType: undefined }).ok, false);
  assert.equal(classifyMonthlyBudgetRequest({ ...base, stayType: "nightly" }).ok, false);
});

test("fails loudly when no search request was observed", () => {
  const result = classifyMonthlyBudgetRequest(null);
  assert.equal(result.ok, false);
  assert.match(result.detail, /no \/api\/rentals\/search request/);
});
