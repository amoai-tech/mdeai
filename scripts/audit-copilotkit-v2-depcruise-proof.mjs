#!/usr/bin/env node
/**
 * CK-V2-012 · SAN-910 · Migration CI guardrails (audit dashboard + no-new-v1 gate) —
 * synthetic violation proof for no-new-v1 guardrail.
 * Pass: main allowlist scan succeeds · synthetic file fails.
 */
import { spawnSync } from "node:child_process";
import { mkdir, writeFile, rm } from "node:fs/promises";
import { join } from "node:path";

const ROOT = new URL("..", import.meta.url).pathname;
const SYNTHETIC_REL = "src/__fixtures__/ck-v2-synthetic-violation.tsx";
const SYNTHETIC_ABS = join(ROOT, SYNTHETIC_REL);

function run(cmd, args, opts = {}) {
  const r = spawnSync(cmd, args, { cwd: ROOT, encoding: "utf8", ...opts });
  return { status: r.status ?? 1, stdout: r.stdout ?? "", stderr: r.stderr ?? "" };
}

const main = run("node", ["scripts/audit-copilotkit-v2-no-new-v1.mjs"]);
if (main.status !== 0) {
  console.error("FAIL: main allowlist scan should pass");
  console.error(main.stderr || main.stdout);
  process.exit(1);
}
console.log("✓ main allowlist scan passes");

await mkdir(join(ROOT, "src/__fixtures__"), { recursive: true });
await writeFile(
  SYNTHETIC_ABS,
  `import { useCoAgent } from "@copilotkit/react-core";\nexport function Bad() { useCoAgent({ name: "x" }); }\n`,
);

const violation = run("node", ["scripts/audit-copilotkit-v2-no-new-v1.mjs"]);
await rm(SYNTHETIC_ABS, { force: true });

if (violation.status === 0) {
  console.error("FAIL: synthetic v1 import should be rejected");
  console.error(violation.stdout || violation.stderr);
  process.exit(1);
}
console.log("✓ synthetic v1 violation correctly rejected");

const depcruise = run("npx", ["depcruise", "--config", ".dependency-cruiser.cjs", "src"], {
  env: { ...process.env, FORCE_COLOR: "0" },
});
if (depcruise.status !== 0) {
  console.error("FAIL: dependency-cruiser should pass on main src/");
  console.error(depcruise.stderr || depcruise.stdout);
  process.exit(1);
}
console.log("✓ dependency-cruiser passes on main src/");

// SAN-1401 — the dedicated CopilotKit audit must reject the legacy root runtime.
const RUNTIME_VIOLATION_REL = "src/__fixtures__/san1401-runtime-violation.ts";
const RUNTIME_V2_OK_REL = "src/__fixtures__/san1401-runtime-v2-ok.ts";

await writeFile(join(ROOT, RUNTIME_VIOLATION_REL), 'import "@copilotkit/runtime";\nexport const x = 1;\n');
const runtimeViolation = run("npx", ["depcruise", "--config", ".dependency-cruiser.cjs", "src"], {
  env: { ...process.env, FORCE_COLOR: "0" },
});
await rm(join(ROOT, RUNTIME_VIOLATION_REL), { force: true });
if (runtimeViolation.status === 0) {
  console.error("FAIL: a bare @copilotkit/runtime import must be rejected by dependency-cruiser");
  console.error(runtimeViolation.stdout || runtimeViolation.stderr);
  process.exit(1);
}
console.log("✓ synthetic legacy @copilotkit/runtime import rejected by dependency-cruiser");

await writeFile(join(ROOT, RUNTIME_V2_OK_REL), 'import "@copilotkit/runtime/v2";\nexport const x = 1;\n');
const runtimeV2 = run("npx", ["depcruise", "--config", ".dependency-cruiser.cjs", "src"], {
  env: { ...process.env, FORCE_COLOR: "0" },
});
await rm(join(ROOT, RUNTIME_V2_OK_REL), { force: true });
if (runtimeV2.status !== 0) {
  console.error("FAIL: @copilotkit/runtime/v2 must remain allowed");
  console.error(runtimeV2.stdout || runtimeV2.stderr);
  process.exit(1);
}
console.log("✓ @copilotkit/runtime/v2 remains allowed");

console.log("\nSAN-910 depcruise proof: ALL PASS");
