/**
 * The #386 regression was a peso monthly budget silently sent as a $2 nightly cap.
 * The smoke must prove the request shape, not just that the page printed a sentence.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { classifyMonthlyBudgetRequest } from "../prod-behaviour-smoke.mjs";

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

test("rejects the historic $2/night cap", () => {
  const result = classifyMonthlyBudgetRequest({
    neighbourhood: "Laureles",
    maxPricePerNight: 2,
  });
  assert.equal(result.ok, false);
});

test("rejects a payload that sends both a monthly and a nightly ceiling", () => {
  const result = classifyMonthlyBudgetRequest({
    maxPriceMonthly: 2_000_000,
    maxPricePerNight: 2,
  });
  assert.equal(result.ok, false);
});

test("rejects a string amount, a near miss, or the wrong monthly amount", () => {
  assert.equal(classifyMonthlyBudgetRequest({ maxPriceMonthly: "2000000" }).ok, false);
  assert.equal(classifyMonthlyBudgetRequest({ maxPriceMonthly: 2_000 }).ok, false);
  assert.equal(
    classifyMonthlyBudgetRequest({ maxPriceMonthly: 2_000_000.5, budgetCurrency: "COP", stayType: "monthly" }).ok,
    false,
  );
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
