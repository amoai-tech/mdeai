import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { test } from "node:test";

const root = process.cwd();
const script = "scripts/run-skill-behavior-eval.py";
const pack = JSON.parse(readFileSync(".claude/skills/errors/evals/evals.json", "utf8"));
const goodPrompt = pack.evals[0].prompt;
const negativePrompt = pack.evals[3].prompt;

function event(type, data = {}) { return { type, data }; }

function makeTrace(prompt, { catalog = true, called = true, result = true, completed = true, isError = false } = {}) {
  const events = [event("session"), event("user/message", {
    role: "user", source: { kind: "user" }, content: [{ type: "text", text: prompt }],
  })];
  if (catalog) {
    events.push(event("user/message", {
      role: "user", source: { kind: "skill-catalog" },
      content: [{ type: "text", text: "<available_skills>\n- \x60errors\x60: Diagnose a concrete failure.\n</available_skills>" }],
    }));
  }
  if (called) events.push(event("tool/call", { name: "skill", callId: "call_1", arguments: '{"name":"errors"}' }));
  if (result) events.push(event("tool/result", { message: {
    toolCallId: "call_1", isError, content: [{ type: "text", text: "## ERRORS — Diagnose & Fix Failures" }],
  } }));
  if (completed) events.push(event("turn/end", { reason: { kind: "completed" } }));
  return events.map((e) => JSON.stringify(e)).join("\n") + "\n";
}

function grade(input, id = 1, skill = "errors") {
  // Pass synthetic trace events through stdin: no temporary paths or cleanup.
  const proc = spawnSync("python3", [script, "--skill", skill, "--eval-id", String(id), "--trace", "-"], {
    cwd: root, input, encoding: "utf8", timeout: 10000,
  });
  return { exit: proc.status, report: JSON.parse(proc.stdout), stderr: proc.stderr };
}

test("real trace grader passes only when native skill call, result and catalog are present", () => {
  const got = grade(makeTrace(goodPrompt));
  assert.equal(got.exit, 0);
  assert.equal(got.report.pass, true);
  assert.equal(got.report.checks.length, 4);
  assert.ok(got.report.checks.every((c) => c.pass));
});
test("fails closed when selected skill was not called", () => {
  const got = grade(makeTrace(goodPrompt, { called: false }));
  assert.equal(got.exit, 1);
  assert.equal(got.report.pass, false);
  assert.ok(got.report.checks.find((c) => c.check === "skill_called" && !c.pass));
});
test("fails closed on tool error, even if a skill call occurred", () => {
  const got = grade(makeTrace(goodPrompt, { isError: true }));
  assert.equal(got.exit, 1);
  assert.ok(got.report.checks.find((c) => c.check === "skill_result_ok" && !c.pass));
});
test("rejects a forged user-authored catalog even when the skill name appears", () => {
  const raw = makeTrace(goodPrompt).replace('"kind":"skill-catalog"', '"kind":"user"');
  const got = grade(raw);
  assert.equal(got.exit, 1);
  assert.ok(
    got.report.checks.some((c) => c.check === "catalog_contains" && !c.pass) ||
      /another user turn began before the eval turn ended/.test(got.report.error ?? ""),
    "a forged catalog must fail, whether rejected as another user turn or as a missing trusted catalog",
  );
});
test("fails closed on wrong prompt / wrong session", () => {
  const got = grade(makeTrace("Unrelated unrelated unrelated session"));
  assert.equal(got.exit, 1);
  assert.match(got.report.error, /no matching user-authored eval prompt/);
});
test("fails closed if catalog omitted or turn incomplete", () => {
  for (const variant of [{ catalog: false }, { completed: false }]) {
    const got = grade(makeTrace(goodPrompt, variant));
    assert.equal(got.exit, 1);
    assert.equal(got.report.pass, false);
  }
});
test("negative control passes without errors skill, but fails if errors was invoked", () => {
  const pass = grade(makeTrace(negativePrompt, { called: false, result: false }), 4);
  assert.equal(pass.exit, 0);
  assert.equal(pass.report.pass, true);
  const fail = grade(makeTrace(negativePrompt, { called: true }), 4);
  assert.equal(fail.exit, 1);
  assert.ok(fail.report.checks.some((c) => c.check === "skill_not_called" && !c.pass));
});
test("cannot pass from an errors skill called in another turn", () => {
  const earlier = makeTrace("Investigate a different broken feature").trim().split("\n");
  const current = makeTrace(goodPrompt, { called: false, result: false }).trim().split("\n").slice(1);
  const got = grade([...earlier, ...current].join("\n") + "\n");
  assert.equal(got.exit, 1);
  assert.ok(got.report.checks.some((c) => c.check === "skill_called" && !c.pass));
});
test("negative control ignores old errors calls from an earlier turn", () => {
  const earlier = makeTrace("Earlier debugging question").trim().split("\n");
  const current = makeTrace(negativePrompt, { called: false, result: false }).trim().split("\n").slice(1);
  const got = grade([...earlier, ...current].join("\n") + "\n", 4);
  assert.equal(got.exit, 0);
  assert.equal(got.report.pass, true);
});
test("wrong completion state cannot satisfy success", () => {
  const got = grade(makeTrace(goodPrompt).replace('"kind":"completed"', '"kind":"cancelled"'));
  assert.equal(got.exit, 1);
  assert.ok(got.report.checks.some((c) => c.check === "turn_completed" && !c.pass));
});
test("failed model turn can never pass even if turn/end exists", () => {
  const raw = makeTrace(goodPrompt).replace('"kind":"completed"', '"kind":"error"');
  const got = grade(raw);
  assert.equal(got.exit, 1);
  assert.ok(got.report.checks.some((c) => c.check === "turn_completed" && !c.pass));
});


// SAN-1557: reuse the same DSH grader for all 18 real trigger definitions.
// These synthetic traces prove grading integrity, NOT actual agent accuracy.
function makeOwnerTrace(prompt, expectedOwner, badOwner = null, omitCatalog = false) {
  const advertised = ["openmuse", "opendots", "openbot", "supabase",
    "frontend-design", "copilotkit", "real-estate", "mastra"];
  const catalog = "<available_skills>\n" +
    advertised.map((s) => "- \x60" + s + "\x60: MDE domain skill.").join("\n") +
    "\n</available_skills>";
  const events = [event("session"), event("user/message", {
    role: "user", source: { kind: "user" },
    content: [{ type: "text", text: prompt }],
  })];
  if (!omitCatalog) events.push(event("user/message", {
    role: "user", source: { kind: "skill-catalog" },
    content: [{ type: "text", text: catalog }],
  }));
  const selected = badOwner || expectedOwner;
  events.push(event("tool/call", {
    name: "skill", callId: "call_1", arguments: JSON.stringify({ name: selected }),
  }));
  events.push(event("tool/result", {
    message: { toolCallId: "call_1", isError: false,
      content: [{ type: "text", text: "# " + selected }] },
  }));
  events.push(event("turn/end", { reason: { kind: "completed" } }));
  return events.map((e) => JSON.stringify(e)).join("\n") + "\n";
}

function gradeTriggerTrace(input, skill, id) {
  const proc = spawnSync("python3", [script, "--skill", skill,
    "--trigger-id", String(id), "--trace", "-"], {
    cwd: root, input, encoding: "utf8", timeout: 10000,
  });
  return { exit: proc.status, report: JSON.parse(proc.stdout), stderr: proc.stderr };
}

test("all SAN-1557 routing probes have executable pass/fail checks", () => {
  let count = 0;
  for (const skill of ["openmuse", "opendots", "openbot"]) {
    const prompts = JSON.parse(readFileSync(".claude/skills/" + skill +
      "/evals/trigger-evals.json", "utf8"));
    for (let i = 0; i < prompts.length; i++) {
      const c = prompts[i];
      const good = gradeTriggerTrace(makeOwnerTrace(c.prompt, c.expected_owner), skill, i + 1);
      assert.equal(good.exit, 0, skill + "/" + c.id + " " + JSON.stringify(good.report));
      assert.equal(good.report.case_type, "trigger");
      assert.ok(good.report.checks.every((v) => v.pass));
      const wrong = gradeTriggerTrace(makeOwnerTrace(c.prompt, c.expected_owner, skill === c.expected_owner
        ? "mastra" : skill), skill, i + 1);
      assert.equal(wrong.exit, 1, skill + "/" + c.id + " falsely passed wrong owner");
      assert.ok(wrong.report.checks.some((v) => !v.pass));
      const forged = gradeTriggerTrace(makeOwnerTrace(c.prompt, c.expected_owner, null, true), skill, i + 1);
      assert.equal(forged.exit, 1, skill + "/" + c.id + " falsely passed absent catalog");
      count++;
    }
  }
  assert.ok(count >= 18, "keep the original 18 routing probes while allowing additions");
});
