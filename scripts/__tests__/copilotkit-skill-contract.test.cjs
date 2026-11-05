const assert = require("node:assert/strict");
const { existsSync, readFileSync } = require("node:fs");
const { join } = require("node:path");
const { test } = require("node:test");

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
  assert.equal(ids.length, 18);
  assert.equal(pack.evals.filter((entry) => !entry.should_trigger).length, 1);
  for (const entry of pack.evals) {
    assert.equal(typeof entry.should_trigger, "boolean");
    assert.ok(entry.expected_output.length >= 70, `missing answer rubric for eval ${entry.id}`);
    assert.match(entry.expected_output, /Content review criteria:/);
    assert.ok(entry.expectations.some((check) => check.check === "turn_completed"));
  }
});

test("native render_ui bridge proof supplies a minimal catalog on the existing provider", () => {
  const native = readFileSync(join(base, "references/native-generative-ui.md"), "utf8");
  assert.match(skill, /minimal, inert, typed development catalog/);
  assert.match(native, /minimal, inert, typed/);
  assert.match(native, /generativeUI=\{\{ ui: probeUI \}\}/);
  assert.match(native, /Do not mistake a catalog-free request for a Mastra defect/);
});

test("native bridge and payment cases retain critical runtime and transaction criteria", () => {
  const pack = JSON.parse(readFileSync(join(base, "evals/evals.json"), "utf8"));
  const byId = new Map(pack.evals.map((item) => [item.id, item.expected_output]));
  for (const id of [9, 17]) {
    assert.match(byId.get(id), /minimal, inert provider QA catalog/);
  }
  assert.match(byId.get(10), /server-side price, quantity and availability revalidation/);
  assert.match(byId.get(10), /signed Stripe TEST webhook/);
});
