// Post-deploy smoke test (OPS-07): `node scripts/smoke.mjs <base-url>`. No dependencies.
const base = process.argv[2]?.replace(/\/+$/, '');
if (!base) {
  console.error('usage: node scripts/smoke.mjs <base-url>');
  process.exit(2);
}

const checks = [
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
    console.log(`FAIL ${path} (${error.message})`);
    failed++;
  }
}
process.exit(failed ? 1 : 0);
