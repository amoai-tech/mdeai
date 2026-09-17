#!/usr/bin/env node
import { spawnSync } from 'node:child_process';

const cases = [
  ['copilotkit', 'Fix a CopilotKit generative UI rendering bug. Answer only with the single MDE skill owner.', /\bcopilotkit\b/i],
  ['systematic-debugging', 'The application build is failing and we do not know which subsystem is responsible. Answer only with the single MDE skill owner.', /systematic-debugging/i],
  ['supabase-s4', 'Change Supabase RLS tenant access rules in production. Answer with the MDE skill owner and whether independent task-verifier is required.', /supabase[\s\S]*task-verifier|task-verifier[\s\S]*supabase/i],
  ['mastra', 'Fix a known Mastra workflow suspend/resume bug. Answer only with the single MDE skill owner.', /\bmastra\b/i],
  ['gemini', 'Fix a known Gemini model/provider configuration bug. Answer only with the single MDE skill owner.', /\bgemini\b/i],
  ['stripe-s4', 'Fix a production Stripe payment retry that could duplicate a charge. Answer with the MDE skill owner and whether independent task-verifier is required.', /stripe[\s\S]*task-verifier|task-verifier[\s\S]*stripe/i],
];

let failed = 0;
for (const [name, prompt, expected] of cases) {
  const result = spawnSync('npx', ['--yes', '@deepseek-ai/dsh', '--profile', 'headless', prompt], {
    cwd: process.cwd(),
    encoding: 'utf8',
    timeout: 120000,
    env: process.env,
  });
  const output = `${result.stdout ?? ''}\n${result.stderr ?? ''}`;
  const ok = result.status === 0 && expected.test(output);
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}`);
  if (!ok) {
    failed += 1;
    console.error(`Expected ${expected}; exit=${result.status}; output=${output.slice(-1200)}`);
  }
}

if (failed > 0) process.exitCode = 1;
else console.log(`DeepSeek routing certification: PASS (${cases.length}/${cases.length})`);
