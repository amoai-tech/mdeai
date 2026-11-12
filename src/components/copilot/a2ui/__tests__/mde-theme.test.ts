import { describe, expect, it } from "vitest";
import { MDE_GENERATIVE_UI } from "../mde-generative-ui";
import { mdeUI } from "../mde-ui-catalog";
import { mdeTheme } from "../mde-theme";

describe("mdeTheme", () => {
  it("maps the official A2UI variables to MDE tokens", () => {
    expect(mdeTheme["--a2ui-color-accent"]).toBe("var(--primary)");
    expect(mdeTheme["--a2ui-color-on-accent"]).toBe("var(--primary-foreground)");
    expect(mdeTheme["--a2ui-color-panel"]).toBe("var(--card)");
    expect(mdeTheme["--a2ui-radius-md"]).toBe("var(--radius)");
    expect(mdeTheme["--a2ui-font-family"]).toBe("var(--font-sans)");
  });
});

describe("MDE_GENERATIVE_UI", () => {
  it("is the single config both providers pass, with the catalog and theme attached", () => {
    expect(MDE_GENERATIVE_UI.ui).toBe(mdeUI);
    expect(MDE_GENERATIVE_UI.theme).toBe(mdeTheme);
    expect(MDE_GENERATIVE_UI.agentIds).toEqual(["conciergeAgent"]);
  });
});
