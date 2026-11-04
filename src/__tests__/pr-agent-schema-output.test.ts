import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseDocument } from "yaml";

/**
 * Pinned upstream PR-Agent v0.49.0 PRReview model:
 * KeyIssuesComponentLink.start_line/end_line are REQUIRED ints, not null.
 * https://github.com/The-PR-Agent/pr-agent/blob/v0.49.0/pr_agent/algo/output_models.py
 *
 * Regression captured from real 4-chunk #719 review (2026-11-04):
 * the model generated start_line: null + end_line: null and triggered
 * _validate_review_schema warnings, yet the outer workflow succeeded.
 */
const source = readFileSync(".pr_agent.toml", "utf8");
const instructions = source.match(/\[pr_reviewer\][\s\S]*?extra_instructions = """([\s\S]*?)"""/)?.[1] ?? "";
const sample = (lines: string) => parseDocument(
  "review:\n  key_issues_to_review:\n    - relevant_file: src/mastra/lib/models.ts\n" +
  "      issue_header: Incorrect route\n      issue_content: |\n        **Technical:** Real issue.\n" +
  lines,
).toJS() as { review: { key_issues_to_review: Array<{ start_line: unknown; end_line: unknown }> } };
const hasValidLineRange = (item: { start_line: unknown; end_line: unknown }) =>
  Number.isInteger(item.start_line) && Number.isInteger(item.end_line) &&
  typeof item.start_line === "number" && typeof item.end_line === "number" &&
  item.start_line > 0 && item.end_line >= item.start_line;

describe("PR-Agent v0.49.0 YAML review schema reliability", () => {
  it("reproduces the malformed real-world null line range", () => {
    const [issue] = sample("      start_line: null\n      end_line: null\n").review.key_issues_to_review;
    expect(issue.start_line).toBeNull();
    expect(issue.end_line).toBeNull();
    expect(hasValidLineRange(issue)).toBe(false);
  });

  it("accepts only a grounded positive integer range", () => {
    const issue = (lines: string) => sample(lines).review.key_issues_to_review[0];
    expect(hasValidLineRange(issue("      start_line: 52\n      end_line: 67\n"))).toBe(true);
    for (const lines of [
      "      start_line: null\n      end_line: null\n",
      "      start_line: true\n      end_line: 60\n",
      "      start_line: -1\n      end_line: 60\n",
      "      start_line: 80\n      end_line: 60\n",
    ]) expect(hasValidLineRange(issue(lines))).toBe(false);
  });

  it("instructs the model to omit unanchored findings rather than use null", () => {
    expect(instructions).toContain("start_line: 52");
    expect(instructions).toContain("end_line: 67");
    expect(instructions).toContain("never null");
    expect(instructions).toContain("omit that finding");
    expect(instructions).toContain("key_issues_to_review: []");
    expect(instructions).toContain('relevant_tests: "Yes"');
    expect(instructions).toContain('relevant_tests: "No"');
  });

  it("avoids YAML block scalars for file paths (which inject a newline)", () => {
    const malformed = parseDocument("relevant_file: |\n  src/mastra/lib/models.ts\n").toJS() as { relevant_file: string };
    expect(malformed.relevant_file).toBe("src/mastra/lib/models.ts\n");
    expect(instructions).toContain('relevant_file: "src/mastra/lib/models.ts"');
    expect(instructions).toContain("never a block scalar for a path");
  });

  it("uses one concise formatting contract instead of repeated YAML directions", () => {
    expect(instructions.length).toBeLessThan(3900);
    expect(instructions.match(/YAML serialization requirement/g)).toHaveLength(1);
  });
});
