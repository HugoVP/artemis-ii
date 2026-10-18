import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';

const workflow = (name: string) => readFile(new URL(`../pipeline/github/workflows/${name}.yml`, import.meta.url), 'utf8');
const production = await workflow('deploy-production');
const staging = await workflow('deploy-staging');
const security = await workflow('security');
const preview = await workflow('preview-build');
const media = await workflow('media');
const setup = await readFile(new URL('../docs/SETUP.md', import.meta.url), 'utf8');
const gitleaks = await readFile(new URL('../.gitleaks.toml', import.meta.url), 'utf8');

test('SEC-01: the Figma file-ID exception preserves default scans and is restricted by rule, path and exact value', () => {
  assert.match(gitleaks, /useDefault = true/);
  assert.match(gitleaks, /\[\[rules\]\]\nid = "generic-api-key"/);
  assert.match(gitleaks, /\[\[rules.allowlists\]\]/);
  assert.match(gitleaks, /condition = "AND"/);
  const literals = [...gitleaks.matchAll(/'''([^']+)'''/g)].map(m => new RegExp(m[1]!));
  assert.equal(literals.length, 2);
  const [path, value] = literals;
  assert.ok(path!.test('scripts/figma-mcp-gateway.test.ts'));
  assert.ok(path!.test('scripts/figma-snapshot.test.mjs'));
  assert.ok(!path!.test('src/client.ts'));
  assert.ok(!path!.test('scripts/figma-mcp-gateway.ts'));
  assert.ok(value!.test('7b6W4tsb9Ia0J0KhyvBWCX'));
  assert.ok(!value!.test('other-value'));
  assert.ok(!value!.test('prefix7b6W4tsb9Ia0J0KhyvBWCXsuffix'));
});

function job(text: string, name: string): string {
  const match = new RegExp(`^  ${name}:\\n([\\s\\S]*?)(?=^  [a-z-]+:\\n|(?![\\s\\S]))`, 'm').exec(text);
  assert.ok(match, `Missing job: ${name}`);
  return match[1]!;
}

test('SEC-03: setup requires CodeQL code scanning protection independently of successful jobs', () => {
  assert.match(setup, /Require code scanning results/);
  assert.match(setup, /CodeQL[\s\S]*?High or higher/);
});

for (const [tool, variable, platform] of [['gitleaks', 'GITLEAKS', 'linux_x64'], ['actionlint', 'ACTIONLINT', 'linux_amd64']]) {
  test(`SEC-01/04: ${tool} download, checksum and extraction preserve the same release filename`, () => {
    const file = `${tool}_\${${variable}_VERSION}_${platform}.tar.gz`;
    assert.ok(security.includes(`-o "${file}"`));
    assert.ok(security.includes(`tar -xzf "${file}" ${tool}`));
    assert.ok(security.includes(`grep "${file}" checksums.txt | sha256sum -c -`));
  });
}

test('OPS-03/04: media upload accepts deployment targets without relying on the caller event name', () => {
  const upload = job(media, 'upload');
  assert.match(upload, /if: inputs.target == 'staging' \|\| inputs.target == 'production'/);
  assert.doesNotMatch(upload, /github.event_name/);
});

test('OPS-04/05: rollback validation rejects main or a different tag before release API calls', () => {
  const match = /- name: Validate dispatch ref\n        run: \|\n((?:          .*(?:\n|$))+)/.exec(production);
  assert.ok(match, 'Missing rollback ref validation');
  const script = match[1]!.replace(/^          /gm, '');
  assert.match(production, /EVENT_NAME: \$\{\{ github.event_name \}\}/);
  assert.match(production, /REF_TYPE: \$\{\{ github.ref_type \}\}/);
  assert.match(production, /REF_NAME: \$\{\{ github.ref_name \}\}/);
  const run = (event: string, type: string, ref: string) => execFileSync('bash', ['-eu', '-c', script], {
    env: { ...process.env, EVENT_NAME: event, REF_TYPE: type, REF_NAME: ref, TAG: 'v1.2.3' }, stdio: 'pipe',
  });
  assert.throws(() => run('workflow_dispatch', 'branch', 'main'));
  assert.throws(() => run('workflow_dispatch', 'tag', 'v1.2.2'));
  assert.doesNotThrow(() => run('workflow_dispatch', 'tag', 'v1.2.3'));
  assert.doesNotThrow(() => run('release', 'tag', 'v1.2.3'));
  assert.match(setup, /gh workflow run deploy-production.yml --ref vX.Y.Z -f tag=vX.Y.Z/);
});

test('OPS-07: production smoke directly depends on the gate whose verified SHA it checks out', () => {
  const smoke = job(production, 'smoke');
  assert.match(smoke, /needs: \[gate, deploy\]/);
  assert.match(smoke, /ref: \$\{\{ needs.gate.outputs.sha \}\}/);
});

test('QA-04: staging scans links after deploy and retains a report even when checks fail', () => {
  const links = job(staging, 'links');
  assert.match(links, /needs: deploy/);
  assert.match(links, /continue-on-error: true/);
  assert.match(links, /linkinator@8\.1\.0/);
  assert.match(links, /--sitemap-url="\$\{SITE_URL%\/\}\/sitemap-index.xml" --check-fragments --format=json/);
  assert.match(links, /--recurse/);
  assert.match(links, /if: always\(\)/);
  assert.match(links, /path: reports\/links/);
});

test('QA-03: preview reports mobile Lighthouse scores for Home, chapter and photo without blocking scores', () => {
  assert.match(preview, /continue-on-error: true/);
  assert.match(preview, /lighthouse@13\.5\.0/);
  assert.match(preview, /node scripts\/lighthouse-pages.ts/);
  assert.match(preview, /if: always\(\)/);
  assert.match(preview, /path: reports\/lighthouse/);
});
