/**
 * The chat transcript must not scroll sideways.
 *
 * CopilotKit's message toolbars use -5px margins, so they poke 5px outside their row. The transcript
 * sets `overflow-y: auto`, which makes `overflow-x` compute to `auto` too, and the 5px shows up as a
 * stray horizontal scrollbar under the assistant reply. It only appears for signed-in renters, whose
 * messages are CopilotKit's own (guests see our local messages, which have no such toolbar).
 *
 * A browser test cannot reproduce this without a real signed-in transcript, so this guards the rule
 * itself; it was confirmed on the real page by applying the same rule to a signed-in /chat tab.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const css = readFileSync(join(process.cwd(), "src/app/globals.css"), "utf8");

function declarationsOf(selector: string): string {
  const start = css.indexOf(`${selector} {`);
  if (start === -1) throw new Error(`${selector} rule not found in globals.css`);
  return css.slice(start, css.indexOf("}", start));
}

describe("chat transcript stylesheet", () => {
  it("clips sideways overflow in the transcript so toolbar margins cannot show a scrollbar", () => {
    const rule = declarationsOf(".mde-center-copilot-chat .copilotKitMessages");
    expect(rule).toMatch(/overflow-y:\s*auto/);
    expect(rule).toMatch(/overflow-x:\s*hidden/);
  });
});
