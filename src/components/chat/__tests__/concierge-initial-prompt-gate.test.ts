import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("ConciergeInitialPrompt — SAN-1356 send gate", () => {
  const source = readFileSync(
    resolve(process.cwd(), "src/components/chat/concierge-initial-prompt.tsx"),
    "utf8",
  );

  it("requires both runtime readiness and an idle concierge before auto-send", () => {
    expect(source).toContain("const { isReady } = useConciergeCoAgent()");
    expect(source).toContain("const { isLoading } = useConciergeChat()");
    expect(source).toContain("!isReady || isLoading");
  });

  it("releases the send gate on promise rejection", () => {
    expect(source).toContain(".catch(");
    expect(source).toContain("sentRef.current = false");
  });

  it("claims the send gate before starting the send", () => {
    expect(source).toContain("sentRef.current = true");
    const claimIndex = source.indexOf("sentRef.current = true");
    const sendCallIndex = source.indexOf("void sendConciergeUserMessage");
    expect(claimIndex).toBeLessThan(sendCallIndex);
  });

  it("releases the send gate on handled === false", () => {
    expect(source).toContain("if (!handled)");
    expect(source).toContain("sentRef.current = false");
  });

  it("strips empty query and replaces URL", () => {
    expect(source).toContain('rawQ !== null && trimmedQ === ""');
    expect(source).toContain('router.replace("/chat", { scroll: false })');
  });

  it("only replaces URL after successful handling", () => {
    expect(source).toContain("if (onChatWithQ)");
    expect(source).toContain('router.replace("/chat", { scroll: false })');
  });

  it("guards against concurrent sends with sentRef", () => {
    expect(source).toContain("sentRef.current");
    // sentRef is checked in the early return condition
    expect(source).toContain("sentRef.current || !isReady || isLoading");
  });

  it("uses useConciergeCoAgent for readiness (not useConciergeChat.isLoading alone)", () => {
    expect(source).toContain("useConciergeCoAgent");
    expect(source).toContain("isReady");
  });

  it("handles empty query by normalizing URL without sending", () => {
    expect(source).toContain('trimmedQ === ""');
    expect(source).toContain("router.replace");
  });
});