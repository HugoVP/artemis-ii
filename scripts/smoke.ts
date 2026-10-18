// Post-deploy smoke test (OPS-07): `node scripts/smoke.ts <base-url>`. No dependencies.
import { existsSync } from 'node:fs';
import { parseManifest } from './pages-media.ts';
import { checkMedia } from './smoke-media.ts';

const base = process.argv[2]?.replace(/\/+$/, '');
if (!base) {
  console.error('usage: node scripts/smoke.ts <base-url>');
  process.exit(2);
}

type SmokeCheck = readonly [path: string, test: (response: Response, body: string) => boolean];

const checks: readonly SmokeCheck[] = [
  ['/es/', (r, body) => r.ok && body.includes('<html lang="es"')],
  ['/en/', (r, body) => r.ok && body.includes('<html lang="en"')],
  ['/sitemap-index.xml', (r) => r.ok],
  ['/es/', (r) => r.headers.get('x-content-type-options') === 'nosniff' && !!r.headers.get('content-security-policy')],
];

let failed = 0;
for (const [path, test] of checks) {
  try {
    const res = await fetch(base + path, { redirect: 'follow' });
    const ok = test(res, await res.text());
    console.log(`${ok ? 'ok  ' : 'FAIL'} ${path}`);
    if (!ok) failed++;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.log(`FAIL ${path} (${message})`);
    failed++;
  }
}
try {
  const response = await fetch(base + '/media/manifest.json');
  if (!response.ok) throw new Error('Missing deployed media manifest');
  const value: unknown = await response.json();
  const manifest = parseManifest(value);
  if (existsSync('scripts/ingest.ts') && manifest.photos.length === 0) throw new Error('Ingestion exists but no deployed photos');
  await checkMedia(base, manifest);
  console.log(`ok   media (${manifest.photos.length} photos; empty shell before Stage 06)`);
} catch (error) {
  console.error('FAIL media', error instanceof Error ? error.message : String(error));
  failed++;
}
process.exit(failed ? 1 : 0);
