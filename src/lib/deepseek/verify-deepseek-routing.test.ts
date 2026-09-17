import { describe, expect, it, vi } from 'vitest';
import { evaluateCase, runCases } from '../../../scripts/verify-deepseek-routing.mjs';

describe('DeepSeek routing certification', () => {
  it('evaluates only the final answer, not echoed prompt diagnostics', () => {
    const probe = { name: 'copilotkit', prompt: 'prompt mentions copilotkit', owner: 'copilotkit', verifier: false };
    const output = 'debug: prompt mentions copilotkit\ndsh: reasoning: wrong owner\nfinal answer: maps';
    expect(evaluateCase(probe, 0, output)).toEqual({ ok: false, answer: 'maps' });
  });

  it('accepts exact owner and verifier decisions', () => {
    const s4 = { name: 'supabase-s4', prompt: 'x', owner: 'supabase', verifier: true };
    expect(evaluateCase(s4, 0, 'dsh: reasoning: ...\nfinal answer: owner=supabase verifier=true')).toEqual({
      ok: true,
      answer: 'owner=supabase verifier=true',
    });
  });

  it('aggregates failures across probes', async () => {
    const probes = [
      { name: 'a', prompt: 'a', owner: 'copilotkit', verifier: false },
      { name: 'b', prompt: 'b', owner: 'mastra', verifier: false },
    ];
    const runner = vi.fn(async (probe: { name: string }) =>
      probe.name === 'a' ? { status: 0, output: 'owner=copilotkit verifier=false' } : { status: 0, output: 'owner=gemini verifier=false' },
    );
    const result = await runCases(probes, runner);
    expect(runner).toHaveBeenCalledTimes(2);
    expect(result.failed).toBe(1);
    expect(result.results.map((item) => item.ok)).toEqual([true, false]);
  });
});
