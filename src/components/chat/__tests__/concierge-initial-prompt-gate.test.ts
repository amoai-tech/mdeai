import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("ConciergeInitialPrompt — SAN-1356 send gate", () => {
  it("requires both runtime readiness and an idle concierge before auto-send", () => {
    const source = readFileSync(
      resolve(process.cwd(), "src/components/chat/concierge-initial-prompt.tsx"),
      "utf8",
    );

    expect(source).toContain("const { isReady } = useConciergeCoAgent()");
    expect(source).toContain("const { isLoading } = useConciergeChat()");
    expect(source).toContain("!isReady || isLoading");
  });

  it("releases the send gate on promise rejection", () => {
    const source = readFileSync(
      resolve(process.cwd(), "src/components/chat/concierge-initial-prompt.tsx"),
      "utf8",
    );

    // Verify .catch() handler exists to reset sentRef on rejection
    expect(source).toContain(".catch(");
    expect(source).toContain("sentRef.current = false");
  });
});
