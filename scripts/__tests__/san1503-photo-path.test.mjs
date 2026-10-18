import assert from 'node:assert/strict';
import { test } from 'node:test';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { readPhotoWithinMediaDirectory } from '../../docs/07-operations/rentals/san-1503/media-path.mjs';

async function fixture(fn) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'mde-photo-path-'));
  const inside = path.join(root, 'photos');
  const sibling = path.join(root, 'photos-backup');
  try {
    await fs.mkdir(path.join(inside, 'apt'), { recursive: true });
    await fs.mkdir(sibling);
    await fs.writeFile(path.join(inside, 'apt', 'image.avif'), 'demo-photo');
    await fs.writeFile(path.join(sibling, 'private.txt'), 'private');
    await fn({ root, inside, sibling });
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
}

test('SAN-1503 reads a normal nested manifest image inside media directory', async () => {
  await fixture(async ({ inside }) => {
    const { body, file } = await readPhotoWithinMediaDirectory(inside, 'apt/image.avif');
    assert.equal(body.toString(), 'demo-photo');
    assert.equal(file, path.join(inside, 'apt', 'image.avif'));
  });
});

test('SAN-1503 rejects ../ traversal and sibling directories with common prefixes', async () => {
  await fixture(async ({ inside }) => {
    await assert.rejects(readPhotoWithinMediaDirectory(inside, '../photos-backup/private.txt'), /escapes photo directory/);
    await assert.rejects(readPhotoWithinMediaDirectory(inside, 'apt/../../photos-backup/private.txt'), /escapes photo directory/);
  });
});

test('SAN-1503 rejects absolute paths and the media root itself', async () => {
  await fixture(async ({ inside }) => {
    await assert.rejects(readPhotoWithinMediaDirectory(inside, '/etc/passwd'), /relative filename/);
    await assert.rejects(readPhotoWithinMediaDirectory(inside, '.'), /escapes photo directory/);
    await assert.rejects(readPhotoWithinMediaDirectory(inside, ''), /relative filename/);
  });
});

test('SAN-1503 rejects symlink files resolving outside the media directory', async () => {
  await fixture(async ({ inside, sibling }) => {
    await fs.symlink(path.join(sibling, 'private.txt'), path.join(inside, 'apt', 'hidden.avif'));
    await assert.rejects(readPhotoWithinMediaDirectory(inside, 'apt/hidden.avif'), /symlink escapes photo directory/);
  });
});

test('SAN-1503 rejects symlink folders resolving outside the media directory', async () => {
  await fixture(async ({ inside, sibling }) => {
    await fs.symlink(sibling, path.join(inside, 'outside'));
    await assert.rejects(readPhotoWithinMediaDirectory(inside, 'outside/private.txt'), /symlink escapes photo directory/);
  });
});

test('SAN-1503 rejects directory entries instead of reading them', async () => {
  await fixture(async ({ inside }) => {
    await assert.rejects(readPhotoWithinMediaDirectory(inside, 'apt'), /not a regular file/);
  });
});
