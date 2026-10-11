#!/usr/bin/env node
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

export const DSH_VERSION = '0.1.5-rc.2';

// Do not include expected owner or verifier values in a probe prompt.
// Otherwise a model can simply echo the answer without discovering skills.
const outputFormat = 'Reply with exactly one line in this format: owner=<skill-name> verifier=<true|false>. Pick the most appropriate skill from the project skill catalog. Do not edit files.';

export const cases = [
  { name: 'copilotkit', prompt: 'Fix a known CopilotKit generative UI rendering bug.', owner: 'copilotkit', verifier: false },
  { name: 'unknown-build-failure', prompt: 'The application build suddenly fails and nobody knows the cause. Diagnose the root cause.', owner: 'errors', verifier: false },
  { name: 'supabase-s4', prompt: 'Change Supabase RLS tenant access rules in production.', owner: 'supabase', verifier: true },
  { name: 'mastra', prompt: 'Fix a known Mastra workflow suspend/resume bug.', owner: 'mastra', verifier: false },
  { name: 'gemini', prompt: 'Fix a known Gemini model/provider configuration bug.', owner: 'gemini', verifier: false },
  { name: 'stripe-s4', prompt: 'Fix a production Stripe payment retry that could duplicate a charge.', owner: 'stripe', verifier: true },
  { name: 'short-praudit', prompt: 'Audit GitHub PR #258 for merge readiness, review comments, security and remaining blockers.', owner: 'praudit', verifier: false },
  { name: 'short-linear-task', prompt: 'Rewrite SAN-1107 as a precise Linear task with ordered implementation steps and acceptance criteria.', owner: 'linear-task', verifier: false },
  { name: 'short-linear-audit', prompt: 'Check whether SAN-1107 is stale by auditing its existing acceptance criteria and dependencies. Do not rewrite it.', owner: 'linear-audit', verifier: false },
  { name: 'short-efficient', prompt: 'Find a faster and simpler alternative to adding a second rental search engine by reusing MDE search.', owner: 'efficient', verifier: false },
  { name: 'short-tests', prompt: 'Design a regression test plan for renter viewing requests, including retries and unauthorized access.', owner: 'tests', verifier: false },
  { name: 'short-plan', prompt: 'Write an implementation plan for the next rental release. Do not modify code.', owner: 'plan', verifier: false },
  { name: 'short-implement', prompt: 'Implement a previously scoped, small event-page UI change.', owner: 'implement', verifier: false },
  { name: 'short-progress', prompt: 'Report verified project progress and what remains blocked.', owner: 'progress', verifier: false },
  { name: 'review-near-miss', prompt: 'Review this existing PR diff for coding regressions; do not assess merge readiness.', owner: 'code-review', verifier: false },
  { name: 'testing-near-miss', prompt: 'Run the existing tests and interpret test failures, without designing a new plan.', owner: 'testing', verifier: false },
].map((item) => ({ ...item, prompt: item.prompt + ' ' + outputFormat }));


export function extractFinalAnswer(output) {
  const lines = String(output).split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const explicit = [...lines].reverse().find((line) => /^final answer:/i.test(line));
  if (explicit) return explicit.replace(/^final answer:\s*/i, '').trim();
  const structured = [...lines].reverse().find((line) => /^owner=[a-z0-9-]+\s+verifier=(true|false)$/i.test(line));
  if (structured) return structured;
  const nonDiagnostic = lines.filter((line) => !/^(dsh:|\[\d+\]|debug:|warning:|warn:|error:)/i.test(line));
  return nonDiagnostic.at(-1) ?? '';
}

export function evaluateCase(probe, status, output) {
  const answer = extractFinalAnswer(output);
  const match = answer.match(/^owner=([a-z0-9-]+)\s+verifier=(true|false)$/i);
  const ok = status === 0 && !!match && match[1].toLowerCase() === probe.owner && (match[2].toLowerCase() === 'true') === probe.verifier;
  return { ok, answer };
}

export function getDshCommand() {
  const configuredHarness = process.env.DSH_CLI_PATH;
  if (configuredHarness && existsSync(configuredHarness)) {
    return { command: process.execPath, args: [configuredHarness, '--profile', 'headless'] };
  }
  return { command: 'npx', args: ['--yes', '--package', `@deepseek-ai/dsh@${DSH_VERSION}`, 'dsh', '--profile', 'headless'] };
}

export function runProbe(probe) {
  return new Promise((resolve) => {
    const dsh = getDshCommand();
    const child = spawn(dsh.command, [...dsh.args, probe.prompt], {
      cwd: process.cwd(),
      env: process.env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let output = '';
    child.stdout.on('data', (chunk) => { output += chunk; });
    child.stderr.on('data', (chunk) => { output += chunk; });
    let timedOut = false;
    const timer = setTimeout(() => { timedOut = true; child.kill('SIGTERM'); }, 120000);
    child.on('close', (status) => {
      clearTimeout(timer);
      resolve({ status: timedOut ? 124 : (status ?? 1), output });
    });
    child.on('error', (error) => {
      clearTimeout(timer);
      resolve({ status: 1, output: `${output}\n${error.message}` });
    });
  });
}

export async function runCases(probes = cases, runner = runProbe) {
  const executions = [];
  for (const probe of probes) {
    const result = await runner(probe);
    const evaluated = evaluateCase(probe, result.status, result.output);
    executions.push({ ...probe, ...evaluated, status: result.status, output: result.output });
  }
  return { failed: executions.filter((item) => !item.ok).length, results: executions };
}

async function main() {
  const { failed, results } = await runCases();
  for (const item of results) {
    console.log(`${item.ok ? 'PASS' : 'FAIL'} ${item.name}`);
    if (!item.ok) {
      console.error(`Expected owner=${item.owner} verifier=${item.verifier}; exit=${item.status}; answer=${JSON.stringify(item.answer)}`);
    }
  }
  if (failed > 0) process.exitCode = 1;
  else console.log(`DeepSeek routing certification: PASS (${results.length}/${results.length})`);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  await main();
}
