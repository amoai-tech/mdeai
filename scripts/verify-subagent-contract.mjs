#!/usr/bin/env node
import { existsSync, readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const REQUIRED_PROMPT_FIELDS = ['Outcome', 'Context', 'Scope', 'Inputs', 'Constraints', 'Evidence', 'STOP', 'Handoff'];

export function extractDelegationPolicy(root = process.cwd()) {
  const path = `${root}/.claude/skills/tasks/references/shared/subagent-standard.md`;
  if (!existsSync(path)) return { error: 'missing contract file: subagent-standard' };
  const standard = readFileSync(path, 'utf8');
  return {
    s0: standard.includes('S0 work uses no subagent.') ? 'none' : 'unknown',
    s1: standard.includes('S1 normally stays in the main agent.') ? 'main' : 'unknown',
    s2: standard.includes('S2 may use one isolated specialist.') ? 'one-isolated-specialist' : 'unknown',
    s3s4: standard.includes('S3/S4 may fan out only dependency-independent work.') ? 'independent-only' : 'unknown',
  };
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

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const policy = extractDelegationPolicy();
  const contracts = verifyRepositoryContracts();
  const checks = {
    s0NoSubagent: policy.s0 === 'none',
    s1MainAgent: policy.s1 === 'main',
    s2OneSpecialist: policy.s2 === 'one-isolated-specialist',
    s3s4IndependentOnly: policy.s3s4 === 'independent-only',
    ...Object.fromEntries(
      Object.entries(contracts).filter(([key, value]) => key !== 'error' && typeof value === 'boolean'),
    ),
  };
  const failed = Object.entries(checks).filter(([, ok]) => !ok);
  if (failed.length) {
    for (const [name] of failed) console.error(`FAIL ${name}`);
    if (contracts.error) console.error(contracts.error);
    process.exitCode = 1;
  } else {
    console.log(`subagent repository contract: PASS (${Object.keys(checks).length}/${Object.keys(checks).length})`);
  }
}
