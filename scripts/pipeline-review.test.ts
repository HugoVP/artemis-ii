import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, mkdtemp, mkdir, writeFile, symlink, rm } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const workflow = (name: string) => readFile(new URL(`../pipeline/github/workflows/${name}.yml`, import.meta.url), 'utf8');
const production = await workflow('deploy-production');
const staging = await workflow('deploy-staging');
const security = await workflow('security');
const preview = await workflow('preview-build');
const ci = await workflow('ci');
const previewDeploy = await workflow('deploy-preview');
const dast = await workflow('dast');
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

test('OPS-03/04: media generation has no credentialed upload or promotion job', () => {
  assert.match(media, /generate:/);
  assert.doesNotMatch(media, /upload:|environment:|secrets\.|workflow_call:/);
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
  assert.match(smoke, /ref: \$\{\{ github.sha \}\}/);
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

test('SEC-06: ZAP keeps diagnostics after a scan error without hiding the error', () => {
  assert.match(dast, /- name: ZAP baseline scan of staging[\s\S]*?docker run --rm/);
  assert.match(dast, /- uses: actions\/upload-artifact@[^\n]+\n        if: always\(\)\n        with:\n          name: zap-report/);
  assert.doesNotMatch(dast, /continue-on-error: true/);
});

test('OPS-02: a failed preview upload or missing URL cannot report success', () => {
  const upload = /- name: Upload to the staging Pages project \(branch preview\)[\s\S]*?(?=\n      - name:|$)/.exec(previewDeploy)?.[0];
  assert.ok(upload);
  assert.match(upload, /set -o pipefail/);
  assert.match(upload, /wrangler@4\.151\.1 pages deploy[^\n]*\| tee deploy\.log/);
  assert.match(upload, /URL=\$\(grep[^\n]*\| tail -1\)/);
  assert.match(upload, /test -n "\$\{URL\}"/);
});

test('OPS-02: preview deploys are serialized per PR and stale commits do not deploy or report success', () => {
  const deploy = job(previewDeploy, 'deploy');
  assert.match(deploy, /concurrency:\n      group: preview-\$\{\{ github\.event\.workflow_run\.pull_requests\[0\]\.number \}\}\n      cancel-in-progress: false/);
  assert.match(deploy, /gh api "repos\/\$\{GITHUB_REPOSITORY\}\/pulls\/\$\{PR_NUMBER\}" --jq '\.head\.sha'/);
  assert.match(deploy, /"\$\{CURRENT_SHA\}" = "\$\{HEAD_SHA\}"/);
  assert.match(deploy, /if: env\.SAME_REPO == 'true' && steps\.current\.outputs\.current == 'true'/);
});

test('OPS-02: CI build is the only PR job named build', () => {
  assert.match(ci, /jobs:\n  build:/);
  assert.match(preview, /jobs:\n  preview-build:/);
  assert.doesNotMatch(preview, /jobs:\n  build:/);
});

function runBlock(text: string, name: string): string {
  const match = new RegExp(`- name: ${name}\\n(?:        [^\\n]+\\n)*?        run: \\|\\n((?:          .*\\n?)+)`).exec(text);
  assert.ok(match, `Missing run block: ${name}`);
  return match[1]!.replace(/^          /gm, '');
}

for (const folder of ['pipeline/github/workflows', '.github/workflows']) {
for (const name of ['preview', 'staging', 'production']) {
  test(`SEC-04: ${folder}/deploy-${name} refuses Worker files, directories and symlinks before credentialed upload`, async () => {
    const text = await readFile(new URL(`../${folder}/deploy-${name}.yml`, import.meta.url), 'utf8');
    const guard = runBlock(text, 'Reject Pages Worker entrypoints');
    assert.ok(text.indexOf('Reject Pages Worker entrypoints') < text.indexOf('wrangler@'));
    const dir = await mkdtemp(join(tmpdir(), 'static-artifact-'));
    try {
      await mkdir(join(dir, 'site'));
      const run = () => execFileSync('bash', ['-eu', '-c', guard], { cwd: dir, stdio: 'pipe' });
      assert.doesNotThrow(run, 'plain static assets are accepted');
      const worker = join(dir, 'site/_worker.js');
      await writeFile(worker, 'export default {};');
      assert.throws(run, 'Worker file is rejected');
      await rm(worker);
      await mkdir(worker);
      assert.throws(run, 'Worker directory is rejected');
      await rm(worker, { recursive: true });
      await symlink('missing-worker', worker);
      assert.throws(run, 'dangling Worker symlink is rejected');
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
}

test(`SEC-04: ${folder}/deploy-production uses the triggering commit only after the gate verifies its identity`, async () => {
  const text = await readFile(new URL(`../${folder}/deploy-production.yml`, import.meta.url), 'utf8');
  assert.match(text, /RUN_SHA: \$\{\{ github.sha \}\}/);
  for (const name of ['build', 'smoke']) assert.match(job(text, name), /ref: \$\{\{ github.sha \}\}/);
  const script = runBlock(text, 'Verify release, commit on main and green staging run');
  const dir = await mkdtemp(join(tmpdir(), 'release-gate-'));
  try {
    const mock = `gh() {
      case "$*" in
        */releases/tags/*) echo '{"draft":false}';;
        */commits/*) echo "$TEST_RESOLVED_SHA";;
        */compare/*) echo ahead;;
        */actions/workflows/*)
          case "$*" in
            *'event=push'*) if [ "$TEST_STAGING_EVENT" != push ]; then echo 0; return; fi;;
          esac
          case "$*" in
            *'branch=main'*) if [ "$TEST_STAGING_BRANCH" != main ]; then echo 0; return; fi;;
          esac
          echo 1;;
        *) return 1;;
      esac
    }\n`;
    const run = (resolved: string, event = 'push', branch = 'main') => execFileSync('bash', ['-eu', '-c', mock + script], {
      env: { ...process.env, TAG: 'v1.2.3', RUN_SHA: 'verified-commit', TEST_RESOLVED_SHA: resolved,
        TEST_STAGING_EVENT: event, TEST_STAGING_BRANCH: branch,
        GITHUB_REPOSITORY: 'example/site', GITHUB_OUTPUT: join(dir, 'output') }, stdio: 'pipe',
    });
    assert.throws(() => run('different-commit'));
    assert.doesNotThrow(() => run('verified-commit'));
    assert.throws(() => run('verified-commit', 'pull_request', 'main'), 'a PR success cannot prove staging');
    assert.throws(() => run('verified-commit', 'workflow_dispatch', 'main'), 'a manual run cannot prove staging');
    assert.throws(() => run('verified-commit', 'push', 'agent/feature'), 'a feature branch push cannot prove staging');
    assert.throws(() => run('verified-commit', 'pull_request', 'agent/feature'));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
}

test('OPS-04/06: setup protects v* tags and enables new checks only after bootstrap on main', () => {
  assert.match(setup, /tag ruleset[\s\S]*?`v\*`[\s\S]*?Restrict updates[\s\S]*?Restrict deletions[\s\S]*?empty bypass list/);
  assert.match(setup, /Merge the installation PR under the existing protections/);
  assert.match(setup, /After the workflows are on `main`[\s\S]*?test PR[\s\S]*?required checks/);
});

test('OPS-06 AC-7: the dedicated approval App is prepared before bootstrap and required by source', () => {
  const appSetup = setup.indexOf('Prepare the dedicated approval App before bootstrap');
  const bootstrap = setup.indexOf('Bootstrap on main');
  const requiredChecks = setup.indexOf('Verify and enable the new rules');
  assert.ok(appSetup >= 0 && appSetup < bootstrap && appSetup < requiredChecks);
  assert.match(setup, /expected source[\s\S]*?any source[\s\S]*?GitHub Actions/);
  assert.match(setup, /APPROVAL_APP_PRIVATE_KEY/);
  assert.match(setup, /scripts\/approval-ruleset.ts/);
});

test('OPS-03/04: Pages preparation and disabling automatic deploys precede bootstrap merge', () => {
  const preparation = setup.indexOf('Prepare Cloudflare before the bootstrap merge');
  assert.ok(preparation >= 0 && preparation < setup.indexOf('Bootstrap on main'));
  assert.match(setup, /Disable automatic Git deployments[\s\S]*?before any merge of the installation PR/);
});

for (const folder of ['pipeline/github/workflows', '.github/workflows']) {
  test(`OPS-02: ${folder}/deploy-preview refuses stale builds before they can replace the latest pending job`, async () => {
    const text = await readFile(new URL(`../${folder}/deploy-preview.yml`, import.meta.url), 'utf8');
    const eligibility = job(text, 'eligibility');
    const deploy = job(text, 'deploy');
    assert.doesNotMatch(eligibility, /concurrency:|environment:|secrets\./);
    assert.match(deploy, /needs: eligibility\n    if: needs.eligibility.outputs.current == 'true'/);
    assert.match(deploy, /Check current PR head\n/); // Recheck after the deployment slot is acquired.
    const script = runBlock(text, 'Check current PR head before queuing');
    const dir = await mkdtemp(join(tmpdir(), 'preview-eligibility-'));
    const output = join(dir, 'output');
    const run = async (built: string, sameRepo = 'true') => {
      await writeFile(output, '');
      execFileSync('bash', ['-eu', '-c', 'gh() { echo "$TEST_HEAD"; }\n' + script], {
        env: { ...process.env, HEAD_SHA: built, TEST_HEAD: 'latest', SAME_REPO: sameRepo,
          PR_NUMBER: '14', GITHUB_REPOSITORY: 'example/site', GITHUB_OUTPUT: output }, stdio: 'pipe',
      });
      return (await readFile(output, 'utf8')).includes('current=true');
    };
    try {
      // One deployment is running and the latest head is pending; an older build completes last.
      let pending = '';
      if (await run('latest')) pending = 'latest';
      if (await run('older')) pending = 'older';
      assert.equal(pending, 'latest', 'a stale build never enters the group and evicts the latest head');
      assert.equal(await run('fork-head', 'false'), true, 'forks still reach the non-deploy status reporter');
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
  test(`OPS-06 AC-7: ${folder}/approval uses a status-only App after environment approval and no project code`, async () => {
    const text = await readFile(new URL(`../${folder}/approval.yml`, import.meta.url), 'utf8');
    assert.match(text, /pull_request_target:/);
    assert.match(text, /^permissions: \{\}/m);
    assert.match(text, /environment: approval/);
    assert.match(text, /actions\/create-github-app-token@[0-9a-f]{40}/);
    assert.match(text, /app-id: \$\{\{ vars.APPROVAL_APP_ID \}\}/);
    assert.match(text, /private-key: \$\{\{ secrets.APPROVAL_APP_PRIVATE_KEY \}\}/);
    assert.match(text, /repositories: \$\{\{ github.event.repository.name \}\}/);
    assert.match(text, /permission-statuses: write/);
    assert.match(text, /GH_TOKEN: \$\{\{ steps.approval-app.outputs.token \}\}/);
    assert.match(text, /HEAD_SHA: \$\{\{ github.event.pull_request.head.sha \}\}/);
    assert.doesNotMatch(text, /github.token|statuses: write\n    steps|actions\/checkout|\b(?:npm|npx|node)\b/);
    assert.doesNotMatch(text, /continue-on-error|always\(\)/);
  });
  test(`OPS-02: ${folder}/preview-build checks out the PR head that deployment reports`, async () => {
    const text = await readFile(new URL(`../${folder}/preview-build.yml`, import.meta.url), 'utf8');
    assert.match(text, /ref: \$\{\{ github.event.pull_request.head.sha \}\}/);
  });
}
