import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

const base = join(process.cwd(), ".claude/skills/copilotkit");
const skill = readFileSync(join(base, "SKILL.md"), "utf8");

test("CopilotKit skill has no missing markdown reference targets", () => {
  const refs = [...skill.matchAll(/`(references\/[a-zA-Z0-9_./-]+\.md)`/g)]
    .map((match) => match[1]);
  assert.ok(refs.length >= 7, "expected direct official and local reference links");
  for (const ref of new Set(refs)) {
    assert.equal(existsSync(join(base, ref)), true, `missing: ${ref}`);
  }
});

test("a task combining native and protocol A2UI routes to both guides", () => {
  assert.match(skill, /load both when a single task mentions both/);
  const protocol = readFileSync(join(base, "references/a2ui-protocol.md"), "utf8");
  assert.match(protocol, /also read `native-generative-ui\.md`/);
  assert.doesNotMatch(protocol, /read `native-generative-ui\.md` instead/);
});

test("CopilotKit model eval pack is runnable without dropping content rubrics", () => {
  const pack = JSON.parse(readFileSync(join(base, "evals/evals.json"), "utf8"));
  const ids = pack.evals.map((item) => item.id);
  assert.equal(new Set(ids).size, ids.length);
  assert.ok(ids.includes(18));
  for (const entry of pack.evals) {
    assert.equal(typeof entry.should_trigger, "boolean");
    assert.match(entry.expected_output, /Content review criteria:/);
    assert.ok(entry.expectations.some((check) => check.check === "turn_completed"));
  }
});
