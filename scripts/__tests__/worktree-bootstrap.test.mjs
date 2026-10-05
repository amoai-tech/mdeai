import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

const script = new URL('../worktree-bootstrap.sh', import.meta.url).pathname;

function run(cmd, args, cwd, env = process.env) {
  return execFileSync(cmd, args, { cwd, env, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
}

function makeRepo() {
  const root = mkdtempSync(join(tmpdir(), 'mde-worktree-bootstrap-'));
  const main = join(root, 'main');
  const linked = join(root, 'linked');
  mkdirSync(main);
  run('git', ['init', '-b', 'main'], main);
  run('git', ['config', 'user.email', 'test@example.com'], main);
  run('git', ['config', 'user.name', 'Test'], main);
  writeFileSync(join(main, 'README.md'), 'fixture\n');
  run('git', ['add', 'README.md'], main);
  run('git', ['commit', '-m', 'fixture'], main);
  run('git', ['worktree', 'add', '-b', 'fixture-linked', linked], main);
  return { root, main, linked };
}

test('creates a missing common info directory and runs the repository-standard npm ci', () => {
  const { root, main, linked } = makeRepo();
  try {
    writeFileSync(join(main, '.env'), 'PUBLIC_FIXTURE=1\n');
    mkdirSync(join(main, '.codacy'));
    writeFileSync(join(main, '.codacy', 'config.yaml'), 'fixture: true\n');
    rmSync(join(main, '.git', 'info'), { recursive: true, force: true });

    const bin = join(root, 'bin');
    mkdirSync(bin);
    const npmLog = join(root, 'npm-args.txt');
    const fakeNpm = join(bin, 'npm');
    writeFileSync(fakeNpm, `#!/usr/bin/env bash\nprintf '%s\\n' "$*" > "${npmLog}"\n`);
    chmodSync(fakeNpm, 0o755);

    const result = spawnSync('bash', [script], {
      cwd: linked,
      env: { ...process.env, PATH: `${bin}:${process.env.PATH}` },
      encoding: 'utf8',
    });
    assert.equal(result.status, 0, result.stderr);

    assert.equal(readFileSync(npmLog, 'utf8').trim(), 'ci --no-audit --no-fund');
    assert.match(readFileSync(join(main, '.git', 'info', 'exclude'), 'utf8'), /^\/\.codacy\/$/m);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('refuses a bare repository instead of treating it as the main checkout', () => {
  const root = mkdtempSync(join(tmpdir(), 'mde-worktree-bootstrap-bare-'));
  const seed = join(root, 'seed');
  const bare = join(root, 'repo.git');
  const linked = join(root, 'linked');
  try {
    mkdirSync(seed);
    run('git', ['init', '-b', 'main'], seed);
    run('git', ['config', 'user.email', 'test@example.com'], seed);
    run('git', ['config', 'user.name', 'Test'], seed);
    writeFileSync(join(seed, 'README.md'), 'fixture\n');
    run('git', ['add', 'README.md'], seed);
    run('git', ['commit', '-m', 'fixture'], seed);
    run('git', ['clone', '--bare', seed, bare], root);
    run('git', ['worktree', 'add', linked, 'main'], bare);
    writeFileSync(join(bare, '.env'), 'SHOULD_NOT_LINK=1\n');

    const bin = join(root, 'bin');
    mkdirSync(bin);
    const fakeNpm = join(bin, 'npm');
    writeFileSync(fakeNpm, '#!/usr/bin/env bash\nexit 0\n');
    chmodSync(fakeNpm, 0o755);

    const result = spawnSync('bash', [script], {
      cwd: linked,
      env: { ...process.env, PATH: `${bin}:${process.env.PATH}` },
      encoding: 'utf8',
    });
    assert.notEqual(result.status, 0, 'bare repositories have no canonical main checkout');
    assert.match(result.stderr, /bare repository/i);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('does not expose the main checkout environment unless explicitly opted in', () => {
  const { root, main, linked } = makeRepo();
  try {
    writeFileSync(join(main, '.env'), 'SUPABASE_SERVICE_ROLE_KEY=production-fixture\n');
    const bin = join(root, 'bin');
    mkdirSync(bin);
    const fakeNpm = join(bin, 'npm');
    writeFileSync(fakeNpm, '#!/usr/bin/env bash\nexit 0\n');
    chmodSync(fakeNpm, 0o755);
    const env = { ...process.env, PATH: `${bin}:${process.env.PATH}` };

    const safeRun = spawnSync('bash', [script], { cwd: linked, env, encoding: 'utf8' });
    assert.equal(safeRun.status, 0, safeRun.stderr);
    assert.equal(existsSync(join(linked, '.env')), false);

    const optedInRun = spawnSync('bash', [script], {
      cwd: linked,
      env: { ...env, MDE_WORKTREE_LINK_ENV: '1' },
      encoding: 'utf8',
    });
    assert.equal(optedInRun.status, 0, optedInRun.stderr);
    assert.equal(readFileSync(join(linked, '.env'), 'utf8'), 'SUPABASE_SERVICE_ROLE_KEY=production-fixture\n');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
