import { readFileSync } from "node:fs";
import path from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { MDE_UI_OVERRIDES, MdeAICard } from "../mde-ui-catalog";
import { mdeTheme } from "../mde-theme";

describe("mdeTheme", () => {
  it("maps the official A2UI variables to MDE tokens", () => {
    expect(mdeTheme["--a2ui-color-accent"]).toBe("var(--primary)");
    expect(mdeTheme["--a2ui-color-on-accent"]).toBe("var(--primary-foreground)");
    expect(mdeTheme["--a2ui-color-panel"]).toBe("var(--card)");
    expect(mdeTheme["--a2ui-radius-md"]).toBe("var(--radius)");
    expect(mdeTheme["--a2ui-font-family"]).toBe("var(--font-sans)");
  });

  it("is passed to both CopilotKit providers", () => {
    for (const rel of [
      "src/components/copilot/copilot-kit-provider.tsx",
      "src/components/chat/chat-provider.tsx",
    ]) {
      const source = readFileSync(path.join(process.cwd(), rel), "utf8");
      expect(source, `${rel} must import the theme`).toContain(
        'from "@/components/copilot/a2ui/mde-theme"',
      );
      expect(source, `${rel} must pass the theme to generativeUI`).toContain("theme: mdeTheme");
    }
  });
});

describe("Card override", () => {
  it("keeps the official Card slot and renders MDE styling", () => {
    const html = renderToStaticMarkup(
      <MdeAICard>
        <span>Hello</span>
      </MdeAICard>,
    );
    expect(html).toContain('data-slot="mde-ai-card"');
    expect(html).toContain("Hello");
    expect(html).toContain("bg-card");
  });

  it("is registered as the Card override", () => {
    expect(MDE_UI_OVERRIDES.Card.component).toBe(MdeAICard);
  });
});
