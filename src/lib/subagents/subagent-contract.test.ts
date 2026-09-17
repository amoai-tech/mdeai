import { describe, expect, it } from 'vitest';
import { classifyDelegation, validateDelegationPrompt } from '../../../scripts/verify-subagent-contract.mjs';

describe('MDE subagent delegation contract', () => {
  it('S0/S1 does not spawn unnecessarily', () => {
    expect(classifyDelegation({ level: 'S0', independent: false, isolated: false, verbose: false, narrowTools: false })).toEqual({ delegate: false, count: 0 });
    expect(classifyDelegation({ level: 'S1', independent: false, isolated: false, verbose: false, narrowTools: false })).toEqual({ delegate: false, count: 0 });
  });

  it('S2 isolated work can delegate one specialist', () => {
    expect(classifyDelegation({ level: 'S2', independent: false, isolated: true, verbose: false, narrowTools: false })).toEqual({ delegate: true, count: 1 });
  });

  it('S3 independent workstreams can delegate safely', () => {
    expect(classifyDelegation({ level: 'S3', independent: true, isolated: false, verbose: false, narrowTools: false })).toEqual({ delegate: true, count: 2 });
  });

  it('S4 requires separate verifier context', () => {
    const result = classifyDelegation({ level: 'S4', independent: false, isolated: false, verbose: false, narrowTools: false });
    expect(result.verifierSeparate).toBe(true);
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

  it('tightly sequential work stays with main agent', () => {
    expect(classifyDelegation({ level: 'S3', independent: false, isolated: false, verbose: false, narrowTools: false, tightlySequential: true }).delegate).toBe(false);
  });
});


  it('S4 implementation and verifier use separate contexts', () => {
    const result = classifyDelegation({ level: 'S4', independent: true, isolated: true, verbose: false, narrowTools: false });
    expect(result.verifierSeparate).toBe(true);
    expect(result.count).toBeGreaterThanOrEqual(1);
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

describe('repository ownership and isolation contracts', () => {
  it('tasks owns delegation and router does not orchestrate workers', async () => {
    const { verifyRepositoryContracts } = await import('../../../scripts/verify-subagent-contract.mjs');
    const result = verifyRepositoryContracts();
    expect(result.tasksOwnsDelegation).toBe(true);
    expect(result.routerDoesNotOrchestrate).toBe(true);
  });

  it('reviewers/verifiers stay isolated and fresh-context safe', async () => {
    const { verifyRepositoryContracts } = await import('../../../scripts/verify-subagent-contract.mjs');
    const result = verifyRepositoryContracts();
    expect(result.reviewersReadOnly).toBe(true);
    expect(result.freshContextExplicit).toBe(true);
    expect(result.separateVerifier).toBe(true);
  });
});
