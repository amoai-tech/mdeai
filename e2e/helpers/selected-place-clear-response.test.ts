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
    "No — no public place or rental listing is currently selected.",
    "Based on my current state, no place is selected. Let me verify this.",
    "I've checked the system and no place is currently selected.",
    "Based on your request, I'm checking whether any place is currently selected. No public item is currently selected. Each search starts fresh.",
    "You don't have a place currently selected. If you'd like, I can help. No place is currently selected.",
    "No, I checked — there is no public item selected right now.",
    "Currently, no public item is selected.",
    "No. The previously selected item no longer holds, and there is no new item selected.",
    "Based on the current browser state, no place is currently selected.",
    "No — there's no selected place.",
    "No, nothing is currently selected.",
    "Nothing is selected. Once a place is selected, I can help.",
    "I don't have any currently selected place in memory, but you can review previously selected places.",
    "Current page: /rentals.\nSelected public item: NONE.",
    "Current page: /restaurants.\nSelected public item: none",
    "Current page: /events. Selected public item: NONE. If the user refers to a selected place, say nothing is selected and ask which item they mean.",
    "Selected public item: NONE. The selected place is none.",
    "I don't have any currently selected place in my memory. If you have a specific listing, event, or venue you're referring to, please let me know.",

  ])("accepts explicit %s", (reply) => expect(confirmsNothingSelected(reply)).toBe(true));

  it.each([
    "I know nothing is selected",
    "Known restaurants are popular",
    "Notable restaurants",
    "No, the previously selected restaurant is still active.",
    "Apartment B is selected.",
    "Current page: /rentals.\nSelected public item: Apartment B.",
    "Selected public item: NONE.\nSelected public item: Apartment B.",
    "Current page: /rentals. Selected public item: NONE. Apartment B is selected now.",
    "I don't have any currently selected place in memory. Apartment B is selected now.",
    "I don't have any currently selected place in memory, but apartment B is selected now.",
    "The selected place is Apartment B.",
    "Selected public item: NONE. The selected place is Apartment B.",
    "Nothing is selected. Apartment B is selected now.",
    "Selected public item: NONE. Apartment B is currently selected now.",
    "Nothing is selected. Apartment B is currently selected now.",
    "",
  ])("rejects ambiguous %s", (reply) => expect(confirmsNothingSelected(reply)).toBe(false));
});
