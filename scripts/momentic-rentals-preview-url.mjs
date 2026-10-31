/** Convert a trusted Momentic test's production start path into the exact verified PR preview origin. */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export function previewStartUrl(previewUrl, yaml, testPath) {
  const preview = new URL(previewUrl);
  if (preview.protocol !== 'https:' || !/^[a-z0-9-]+\.vercel\.app$/.test(preview.hostname) ||
      preview.username || preview.password || preview.port || preview.search || preview.hash || preview.pathname !== '/') {
    throw new Error('Expected a verified, root-path HTTPS Vercel preview origin');
  }
  if (!/^momentic\/rentals\/[a-z0-9-]+\.test\.yaml$/.test(testPath)) {
    throw new Error('Only trusted Rentals test paths are allowed');
  }
  const match = yaml.match(/^url:\s*(https?:\/\/[^\s#]+)\s*$/m);
  if (!match) throw new Error(`Missing explicit test start URL: ${testPath}`);
  const expected = new URL(match[1]);
  if (expected.origin !== 'https://www.mdeai.co' || expected.username || expected.password || expected.hash) {
    throw new Error(`Test URL must be under the public MDE origin: ${testPath}`);
  }
  return new URL(expected.pathname + expected.search, preview.origin).href;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const [, , preview, testPath] = process.argv;
  try {
    if (!preview || !testPath) throw new Error('Usage: node scripts/momentic-rentals-preview-url.mjs <preview-root-url> <test-path>');
    process.stdout.write(previewStartUrl(preview, readFileSync(testPath, 'utf8'), testPath) + '\n');
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
