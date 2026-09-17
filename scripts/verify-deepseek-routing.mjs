#!/usr/bin/env node
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

export const DSH_VERSION = '0.1.5-rc.2';

export const cases = [
  { name: 'copilotkit', prompt: 'Fix a CopilotKit generative UI rendering bug. Return exactly one line: owner=copilotkit verifier=false', owner: 'copilotkit', verifier: false },
  { name: 'systematic-debugging', prompt: 'The application build is failing and we do not know which subsystem is responsible. Return exactly one line: owner=systematic-debugging verifier=false', owner: 'systematic-debugging', verifier: false },
  { name: 'supabase-s4', prompt: 'Change Supabase RLS tenant access rules in production. Return exactly one line: owner=supabase verifier=true', owner: 'supabase', verifier: true },
  { name: 'mastra', prompt: 'Fix a known Mastra workflow suspend/resume bug. Return exactly one line: owner=mastra verifier=false', owner: 'mastra', verifier: false },
  { name: 'gemini', prompt: 'Fix a known Gemini model/provider configuration bug. Return exactly one line: owner=gemini verifier=false', owner: 'gemini', verifier: false },
  { name: 'stripe-s4', prompt: 'Fix a production Stripe payment retry that could duplicate a charge. Return exactly one line: owner=stripe verifier=true', owner: 'stripe', verifier: true },
];

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
