import test from 'node:test';
import assert from 'node:assert/strict';
import { assessEmbeddingReadiness } from '../check-local-embedding-readiness.mjs';

const ready = {
  edgeRunning: true,
  restartPolicy: 'unless-stopped',
  functionHttpStatus: 405,
  projectUrlConfigured: true,
  cronSecretConfigured: true,
  pending: 10,
  lastCronStatus: 'succeeded',
  lastCronAgeSeconds: 35,
};

test('healthy local worker passes even with a queue waiting for the next minute', () => {
  assert.deepEqual(assessEmbeddingReadiness(ready), []);
});

test('a running worker with no reboot policy fails readiness', () => {
  assert.match(assessEmbeddingReadiness({ ...ready, restartPolicy: 'no' }).join(' '), /automatically restart/);
});

test('missing local Edge Runtime fails before false success', () => {
  assert.match(assessEmbeddingReadiness({ ...ready, edgeRunning: false, functionHttpStatus: 503 }).join(' '), /Edge Runtime.*HTTP 503/);
});

test('missing local Vault entries fail and are never printed', () => {
  const errors = assessEmbeddingReadiness({ ...ready, projectUrlConfigured: false, cronSecretConfigured: false });
  assert.equal(errors.length, 2);
  assert.match(errors.join(' '), /project_url.*embedding_cron_secret/);
});

test('latest scheduler failure with pending work fails', () => {
  assert.match(assessEmbeddingReadiness({ ...ready, lastCronStatus: 'failed' }).join(' '), /failed/);
});

test('stale scheduler fails when work is pending', () => {
  assert.match(assessEmbeddingReadiness({ ...ready, lastCronAgeSeconds: 400 }).join(' '), /not run recently/);
});

test('idle queues do not require a recent cron execution', () => {
  assert.deepEqual(assessEmbeddingReadiness({
    ...ready, pending: 0, lastCronStatus: null, lastCronAgeSeconds: null,
  }), []);
});
