import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("Concierge local fast-path transcript placement", () => {
  it("renders local messages inside the CopilotChat scroll view instead of beside it", () => {
    const center = readFileSync(
      resolve(process.cwd(), "src/components/chat/chat-center-panel.tsx"),
      "utf8",
    );
    const view = readFileSync(
      resolve(process.cwd(), "src/components/chat/concierge-copilot-chat-view.tsx"),
      "utf8",
    );

    expect(center).not.toContain("<ConciergeLocalChatMessages");
    expect(view).toContain("<ConciergeLocalChatMessages");
    expect(view).toContain("scrollView={ConciergeScrollView}");
  });
});
