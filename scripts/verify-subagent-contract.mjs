#!/usr/bin/env node
import { existsSync, readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

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
  const value = prompt && typeof prompt === 'object' ? prompt : {};
  const missing = REQUIRED_PROMPT_FIELDS.filter(
    (field) => typeof value[field] !== 'string' || !value[field].trim(),
  );
  return { ok: missing.length === 0, missing, stop: missing.length > 0 };
}

export function verifyRepositoryContracts(root = process.cwd()) {
  const paths = {
    tasks: `${root}/.claude/skills/tasks/SKILL.md`,
    router: `${root}/.claude/skills/using-mde-skills/SKILL.md`,
    standard: `${root}/.claude/skills/tasks/references/shared/subagent-standard.md`,
    outcome: `${root}/.claude/skills/tasks/references/shared/outcome-rubric-standard.md`,
  };
  const missingFiles = Object.entries(paths).filter(([, path]) => !existsSync(path)).map(([name]) => name);
  if (missingFiles.length) {
    return { filesReadable: false, error: `missing contract file(s): ${missingFiles.join(', ')}` };
  }

  const tasks = readFileSync(paths.tasks, 'utf8');
  const router = readFileSync(paths.router, 'utf8');
  const standard = readFileSync(paths.standard, 'utf8');
  const outcome = readFileSync(paths.outcome, 'utf8');

  return {
    filesReadable: true,
    tasksOwnsDelegation:
      tasks.includes('`tasks` is the build orchestrator for substantial MDE work.') &&
      tasks.includes('When delegation is useful, follow [`references/shared/subagent-standard.md`]'),
    routerDoesNotOrchestrate:
      router.includes('Do not plan implementation steps, choose support arrays, manage parallelization, manage Linear handoff, or duplicate domain/vendor instructions here.') &&
      !/spawn (?:a |the )?subagent|delegate (?:to|work to) (?:a |the )?subagent/i.test(router),
    reviewersReadOnly:
      standard.includes('Researcher/reviewer/verifier agents are read-only unless a specific task proves mutation is required.') &&
      standard.includes('Reviewer/verifier agents must not silently fix the artifact they certify; return findings/evidence to `tasks`.'),
    freshContextExplicit:
      standard.includes('Do not assume parent instructions or conversation context are present.'),
    separateVerifier:
      outcome.includes('For S3/S4, implementation and final grading must use separate contexts.'),
    sequentialWorkSerialized:
      standard.includes('serialize schema/API/interface contracts and consequential side effects.'),
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
