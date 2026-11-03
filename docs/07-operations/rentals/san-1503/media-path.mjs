/**
 * Read a manifest image only when both its lexical and symlink-resolved path
 * remain strictly inside the operator's configured local media directory.
 *
 * The manifest is checked into Git, but treat its path cells as untrusted data.
 * This utility does not read or write any Supabase resources.
 */
import fs from 'node:fs/promises';
import path from 'node:path';

function isChildDirectoryPath(base, target) {
  const relative = path.relative(base, target);
  return Boolean(relative) &&
    relative !== '..' &&
    !relative.startsWith(`..${path.sep}`) &&
    !path.isAbsolute(relative);
}

export async function readPhotoWithinMediaDirectory(mediaDir, localFile) {
  if (typeof localFile !== 'string' ||
      !localFile || path.isAbsolute(localFile) ||
      localFile.includes('\0')) {
    throw new Error('Manifest photo path must be a nonempty relative filename');
  }

  const base = await fs.realpath(mediaDir);
  const requested = path.resolve(base, localFile);
  if (!isChildDirectoryPath(base, requested)) {
    throw new Error(`Manifest path escapes photo directory: ${localFile}`);
  }

  // path.resolve alone does not account for symlinks in local folders.
  const canonical = await fs.realpath(requested);
  if (!isChildDirectoryPath(base, canonical)) {
    throw new Error(`Manifest symlink escapes photo directory: ${localFile}`);
  }

  const info = await fs.stat(canonical);
  if (!info.isFile()) throw new Error(`Manifest path is not a regular file: ${localFile}`);
  return { file: canonical, body: await fs.readFile(canonical) };
}
