import { describe, expect, it } from 'vitest';
import { extractDelegationPolicy, validateDelegationPrompt, verifyRepositoryContracts } from '../../../scripts/verify-subagent-contract.mjs';

describe('MDE subagent delegation contract', () => {
  it('S0/S1 does not spawn unnecessarily', () => {
    const policy = extractDelegationPolicy();
    expect(policy.s0).toBe('none');
    expect(policy.s1).toBe('main');
  });

  it('S2 isolated work can delegate one specialist', () => {
    expect(extractDelegationPolicy().s2).toBe('one-isolated-specialist');
  });

  it('S3/S4 fan out only dependency-independent workstreams', () => {
    expect(extractDelegationPolicy().s3s4).toBe('independent-only');
  });

  it('S4 requires separate verifier context', () => {
    expect(verifyRepositoryContracts().separateVerifier).toBe(true);
  });

  it('delegation prompt requires all canonical fields', () => {
    expect(validateDelegationPrompt({
      Outcome: 'x', Context: 'x', Scope: 'x', Inputs: 'x', Constraints: 'x',
      Evidence: 'x', STOP: 'x', Handoff: 'x',
    }).ok).toBe(true);
  });

  it('missing critical context stops instead of guessing', () => {
    expect(validateDelegationPrompt({ Outcome: 'x' }).ok).toBe(false);
  });

  it('tightly sequential work stays serialized', () => {
    expect(verifyRepositoryContracts().sequentialWorkSerialized).toBe(true);
  });

  it('S4 implementation and verifier use separate contexts', () => {
    expect(verifyRepositoryContracts().separateVerifier).toBe(true);
  });

  it('fresh-context worker prompt is self-contained', () => {
    const result = validateDelegationPrompt({
      Outcome: 'Produce a scoped evidence package',
      Context: 'Verified repo state and current task checkpoint',
      Scope: 'Only inspect the target workstream',
      Inputs: 'Exact files, URLs, and issue references',
      Constraints: 'Read-only; no hidden parent-chat assumptions',
      Evidence: 'Commands and observed results',
      STOP: 'Stop if an input or permission is missing',
      Handoff: 'Return findings, blockers, and next action',
    });
    expect(result.ok).toBe(true);
    expect(result.stop).toBe(false);
  });

  it('rejects malformed and missing prompt input', () => {
    expect(validateDelegationPrompt(null)).toEqual({
      ok: false,
      missing: ['Outcome', 'Context', 'Scope', 'Inputs', 'Constraints', 'Evidence', 'STOP', 'Handoff'],
      stop: true,
    });
    expect(validateDelegationPrompt({ Outcome: {}, Context: 0 })).toMatchObject({ ok: false, stop: true });
  });
});

describe('repository ownership and isolation contracts', () => {
  it('tasks owns delegation and router does not orchestrate workers', () => {
    const result = verifyRepositoryContracts();
    expect(result.tasksOwnsDelegation).toBe(true);
    expect(result.routerDoesNotOrchestrate).toBe(true);
  });

  it('reviewers/verifiers stay isolated and fresh-context safe', () => {
    const result = verifyRepositoryContracts();
    expect(result.reviewersReadOnly).toBe(true);
    expect(result.freshContextExplicit).toBe(true);
    expect(result.separateVerifier).toBe(true);
  });
});
