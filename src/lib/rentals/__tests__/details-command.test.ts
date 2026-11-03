import { describe, expect, it } from "vitest";
import { parseDetailsCommand } from "@/lib/rentals/details-command";

describe("parseDetailsCommand", () => {
  it.each([
    ["Show me the details.", 1],
    ["show me the details", 1],
    ["Open the details.", 1],
    ["See details", 1],
    ["Show me the details for the first apartment.", 1],
    ["Show me the details for the second apartment.", 2],
    ["Open details of the third one.", 3],
    ["Show me details for the tenth apartment.", 10],
    ["Show me the details for apartment 2.", 2],
  ])("resolves %s to position %i", (text, index) => {
    expect(parseDetailsCommand(text)).toEqual({ index });
  });

  it("leaves a named apartment or a new search to the agent", () => {
    expect(parseDetailsCommand("Show me the details for Calle 10 #42-15.")).toBeNull();
    expect(parseDetailsCommand("Show me details about furnished apartments.")).toBeNull();
    expect(parseDetailsCommand("Find furnished apartments in Laureles.")).toBeNull();
  });
});
