import { describe, expect, it } from "vitest";
import { hasExplicitAmenity, isGroundedAmenityQuestion } from "../grounded-amenity-guard";

describe("grounded amenity follow-up classification", () => {
  it.each([
    "Which café has reliable Wi-Fi?",
    "Do these have power outlets?",
    "Which of these near me would you recommend for laptop work?",
    "Would you recommend one of these for laptop seating?",
    "¿Cuál tiene buen wifi?",
    "¿Tienen enchufes?",
    "Does this café have internet?",
    "Which café in this list has Wi-Fi?",
    "Which cafe in the results has outlets?",

  ])("recognizes a question about displayed places: %s", (question) => {
    expect(isGroundedAmenityQuestion(question)).toBe(true);
  });

  it.each([
    "Find cafés with Wi-Fi in Laureles",
    "Show cafés with laptop seating",
    "Are there cafés with Wi-Fi near me?",
    "Which cafes in Laureles have Wi-Fi?",
    "Which café in Poblado has Wi-Fi?",
    "Which coffee shop in Envigado has Wi-Fi?",
    "¿Qué cafés en Laureles tienen wifi?",
    "Which place in Laureles has Wi-Fi?",
    "Which spot in Poblado has outlets?",


    "Recommend cafés with Wi-Fi in Laureles",
    "¿Hay cafeterías con enchufes cerca?",
    "Does the apartment have Wi-Fi?",
    "Is there internet in the listing?",
    "¿Tiene Wi-Fi este apartamento?",
    "What is a good day trip?",
  ])("does not intercept a new search or different domain: %s", (question) => {
    expect(isGroundedAmenityQuestion(question)).toBe(false);
  });
});

describe("grounded structured amenity facts", () => {
  it("recognizes only the requested amenity and keeps false as known", () => {
    expect(hasExplicitAmenity([{ title: "Café Euge" }])).toBe(false);
    expect(hasExplicitAmenity([{ title: "Café Euge", wifi: true }])).toBe(true);
    expect(hasExplicitAmenity([{ title: "Café Euge", wifi: false }], "Which of these has Wi-Fi?")).toBe(true);
    expect(hasExplicitAmenity([{ seating: "Tables" }], "Which café has Wi-Fi?")).toBe(false);
    expect(hasExplicitAmenity([{ powerOutlets: true }], "Do these have power outlets?")).toBe(true);
    expect(hasExplicitAmenity([{ wifi: true }], "Which café has reliable Wi-Fi?")).toBe(false);
    expect(hasExplicitAmenity([{ wifi: true, powerOutlets: undefined }], "Which has Wi-Fi and outlets?")).toBe(false);
    const cafes = [
      { title: "Café Euge", wifi: true },
      { title: "Café Primavera" },
    ];
    expect(hasExplicitAmenity(cafes, "Which café has Wi-Fi?")).toBe(false);
    expect(hasExplicitAmenity(cafes, "Does Café Euge have Wi-Fi?")).toBe(true);
    expect(hasExplicitAmenity(cafes, "Does Café Primavera have Wi-Fi?")).toBe(false);
    expect(hasExplicitAmenity([{ title: "A", wifi: false }, { title: "B", wifi: true }], "Which has Wi-Fi?")).toBe(true);
  });
});
