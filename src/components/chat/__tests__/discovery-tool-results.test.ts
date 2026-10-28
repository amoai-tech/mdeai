import { describe, expect, it } from "vitest";
import { getLatestDiscoveryToolResult as pick } from "../discovery-tool-results";
import { groundedDiscoveryPins } from "../discovery-grounded-results";

function call(name: string, result: unknown) {
  return [
    { role: "assistant", toolCalls: [{ id: "call-1", function: { name } }] },
    { role: "tool", toolCallId: "call-1", content: JSON.stringify(result) },
  ];
}
describe("discovery tool results (SAN-1145)", () => {
  it("accepts matching restaurant tool rows and rejects invalid coordinates", () => {
    const row = { id: "r1", name: "Restaurant", cuisine: "italian", neighborhood: "Laureles", latitude: 6.2, longitude: -75.5 };
    expect(pick(call("searchRestaurantsTool", { results: [row] }), "restaurants"))
      .toMatchObject({ page: "restaurants", rows: [{ id: "r1" }] });
    expect(pick(call("searchRestaurantsTool", { results: [row] }), "events")).toBeNull();
    expect(pick(call("searchRestaurantsTool", { results: [{ ...row, latitude: 91 }] }), "restaurants")).toBeNull();
  });
  it("only uses event IDs and never trusts prices from the model", () => {
    const id = "5247d1e6-407f-4822-969f-4f7799ef7124";
    expect(pick(call("searchEventsTool", { results: [{ id, pricePerTicket: 0 }] }), "events"))
      .toEqual({ page: "events", ids: [id] });
    expect(pick(call("searchEventsTool", { results: [{ id: "bogus" }] }), "events")).toBeNull();
  });
  it("accepts the right grounded-place kind and rejects cross-page results", () => {
    const row = { id: "google-abc", title: "A café", mapsUrl: "https://maps.google.com/abc", latitude: 6.2, longitude: -75.6 };
    const msgs = call("searchGroundedPlacesTool", { metadata: { venueKind: "cafe" }, results: [row] });
    expect(pick(msgs, "cafes")).toMatchObject({ page: "cafes", rows: [{ id: "google-abc" }] });
    expect(pick(msgs, "nightlife")).toBeNull();
    expect(pick(call("searchWebGroundedEventsTool", { results: [row] }), "events")).toBeNull();
    expect(groundedDiscoveryPins([row])).toMatchObject([{ id: "grounded-google-abc", lat: 6.2, lng: -75.6 }]);
    expect(groundedDiscoveryPins([{ ...row, latitude: 130 }])).toEqual([]);
  });
  it("never revives a stale restaurant result after an Events tool call", () => {
    const old = call("searchRestaurantsTool", { results: [{ id: "old", name: "Old", neighborhood: "Laureles", cuisine: "paisa" }] });
    const later = [
      { role: "assistant", toolCalls: [{ id: "second", function: { name: "searchEventsTool" } }] },
      { role: "tool", toolCallId: "second", content: JSON.stringify({ results: [] }) },
    ];
    expect(pick([...old, ...later], "restaurants")).toBeNull();
    expect(pick([...old, ...later], "events")).toEqual({ page: "events", ids: [] });
    expect(pick([...old, ...later], "events", 3)).toEqual({ page: "events", ids: [] });
  });
});
