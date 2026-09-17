import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const scriptPath = resolve('scripts/verify-deepseek-routing.mjs');

describe('DeepSeek routing certification script', () => {
  it('defines the required owner and S4 verifier probes', () => {
    const source = readFileSync(scriptPath, 'utf8');
    expect(source).toContain('copilotkit');
    expect(source).toContain('systematic-debugging');
    expect(source).toContain('supabase');
    expect(source).toContain('task-verifier');
    expect(source).toContain('mastra');
    expect(source).toContain('gemini');
    expect(source).toContain('stripe');
  });

  it('fails closed when a probe output does not match expectations', () => {
    const source = readFileSync(scriptPath, 'utf8');
    expect(source).toMatch(/process\.exitCode\s*=\s*1/);
    expect(source).toMatch(/expected/i);
  });
});
