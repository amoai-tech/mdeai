#!/usr/bin/env node
import { readFileSync } from 'node:fs';

const REQUIRED_PROMPT_FIELDS = ['Outcome', 'Context', 'Scope', 'Inputs', 'Constraints', 'Evidence', 'STOP', 'Handoff'];

export function classifyDelegation(input) {
  const level = input.level;
  if (input.tightlySequential || level === 'S0' || level === 'S1') {
    return { delegate: false, count: 0, ...(level === 'S4' ? { verifierSeparate: true } : {}) };
  }

  if (level === 'S4') {
    return {
      delegate: Boolean(input.independent || input.isolated || input.verbose || input.narrowTools),
      count: input.independent ? 2 : (input.isolated || input.verbose || input.narrowTools ? 1 : 0),
      verifierSeparate: true,
    };
  }

  if (level === 'S2') {
    const delegate = Boolean(input.independent || input.isolated || input.verbose || input.narrowTools);
    return { delegate, count: delegate ? 1 : 0 };
  }

  if (level === 'S3') {
    if (input.independent) return { delegate: true, count: 2 };
    const delegate = Boolean(input.isolated || input.verbose || input.narrowTools);
    return { delegate, count: delegate ? 1 : 0 };
  }

  return { delegate: false, count: 0 };
}

export function validateDelegationPrompt(prompt) {
  const missing = REQUIRED_PROMPT_FIELDS.filter((field) => !String(prompt[field] ?? '').trim());
  return { ok: missing.length === 0, missing, stop: missing.length > 0 };
}

export function verifyRepositoryContracts(root = process.cwd()) {
  const tasks = readFileSync(`${root}/.claude/skills/tasks/SKILL.md`, 'utf8');
  const router = readFileSync(`${root}/.claude/skills/using-mde-skills/SKILL.md`, 'utf8');
  const standard = readFileSync(`${root}/.claude/skills/tasks/references/shared/subagent-standard.md`, 'utf8');
  const verifier = readFileSync(`${root}/.claude/skills/task-verifier/SKILL.md`, 'utf8');

  return {
    tasksOwnsDelegation: /delegation is useful|subagent-standard/i.test(tasks),
    routerDoesNotOrchestrate: /Do not .*manage parallelization/i.test(router),
    reviewersReadOnly: /read-only/i.test(standard),
    freshContextExplicit: /do not assume parent instructions or conversation context/i.test(standard),
    separateVerifier: /separate contexts|independent/i.test(verifier) || /separate contexts/i.test(standard),
  };
}

if (import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  const checks = verifyRepositoryContracts();
  const failed = Object.entries(checks).filter(([, ok]) => !ok);
  if (failed.length) {
    for (const [name] of failed) console.error(`FAIL ${name}`);
    process.exitCode = 1;
  } else {
    console.log(`subagent repository contract: PASS (${Object.keys(checks).length}/${Object.keys(checks).length})`);
  }
}
