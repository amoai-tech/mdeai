import { describe, expect, it } from "vitest";
import { confirmsNothingSelected } from "./selected-place-clear-response";

describe("SAN-737 explicit cleared selection", () => {
  it.each([
    "No, nothing is selected.",
    "Nothing is selected.",
    "No place is currently selected.",
    "There is no selected place right now.",
    "Selection is cleared.",
    "No — there is no currently selected public record. I last verified Rituales and Pergamino.",
    "No, I checked — there is no public item selected right now.",
  ])("accepts explicit %s", (reply) => expect(confirmsNothingSelected(reply)).toBe(true));

  it.each([
    "I know nothing is selected",
    "Known restaurants are popular",
    "Notable restaurants",
    "No, the previously selected restaurant is still active.",
    "Apartment B is selected.",
    "",
  ])("rejects ambiguous %s", (reply) => expect(confirmsNothingSelected(reply)).toBe(false));
});
