/**
 * A monthly budget is a same-currency comparison.
 *
 * `2,900,000 COP <= 3,500,000` is a real budget check; `2,900,000 <= 3500` compares a monthly COP
 * rent to a nightly USD cap and silently deletes real supply. There is no exchange-rate source in
 * this repository, so the predicate must never compare across currencies.
 */
import { describe, expect, it } from "vitest";
import {
  MONTHLY_BUDGET_NOTE,
  budgetNoteFor,
  monthlyBudgetFromQuery,
  rentalBudgetPredicate,
  rentalMonthlyBudgetPredicate,
} from "../search-rentals";

describe("rentalMonthlyBudgetPredicate", () => {
  it("compares same-currency monthly prices to the monthly budget", () => {
    const clause = rentalMonthlyBudgetPredicate(3_500_000, "COP");
    expect(clause).toContain("and(currency.eq.COP,price_monthly.not.is.null,price_monthly.lte.3500000)");
  });

  it("keeps other-currency listings without comparing them to the budget", () => {
    const clause = rentalMonthlyBudgetPredicate(3_500_000, "COP");
    expect(clause).toContain("and(currency.neq.COP,price_daily.not.is.null)");
    expect(clause).toContain("and(currency.neq.COP,price_monthly.not.is.null)");
  });

  it("never compares a monthly budget against a nightly price", () => {
    const clause = rentalMonthlyBudgetPredicate(3_500_000, "COP");
    expect(clause).not.toContain("price_daily.lte");
  });

  it("requires a stored monthly price for a same-currency match", () => {
    // A nightly-only COP row has no confirmed monthly price, so it is not a monthly match.
    const clause = rentalMonthlyBudgetPredicate(3_500_000, "COP");
    expect(clause).not.toContain("and(currency.eq.COP,price_daily.not.is.null)");
  });

  it("canonicalises the currency case", () => {
    expect(rentalMonthlyBudgetPredicate(1, "cop")).toContain("currency.eq.COP");
  });
});

describe("rentalBudgetPredicate", () => {
  it("prefers the monthly budget when both are supplied", () => {
    const clause = rentalBudgetPredicate(80, { amount: 3_500_000, currency: "COP" });
    expect(clause).toContain("price_monthly.lte.3500000");
    expect(clause).not.toContain("price_daily.lte.80");
  });

  it("falls back to the nightly predicate without a monthly budget", () => {
    expect(rentalBudgetPredicate(80, null)).toContain("price_daily.lte.80");
  });
});

describe("monthlyBudgetFromQuery", () => {
  it("defaults the currency to COP", () => {
    expect(monthlyBudgetFromQuery({ maxPriceMonthly: 2_900_000 })).toEqual({
      amount: 2_900_000,
      currency: "COP",
    });
  });

  it("honours an explicit currency and canonicalises it", () => {
    expect(monthlyBudgetFromQuery({ maxPriceMonthly: 2_900_000, budgetCurrency: "cop" })).toEqual({
      amount: 2_900_000,
      currency: "COP",
    });
  });

  it("is null when no monthly budget was asked for", () => {
    expect(monthlyBudgetFromQuery({})).toBeNull();
    expect(monthlyBudgetFromQuery({ maxPricePerNight: 80 })).toBeNull();
  });
});

describe("budgetNoteFor", () => {
  it("describes the monthly contract, not the nightly one", () => {
    expect(budgetNoteFor({ maxPriceMonthly: 3_500_000 })).toBe(MONTHLY_BUDGET_NOTE);
  });

  it("is undefined when no budget applied", () => {
    expect(budgetNoteFor({})).toBeUndefined();
  });
});
