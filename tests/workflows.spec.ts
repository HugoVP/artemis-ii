import { test, expect } from '@playwright/test';
import { readdirSync, readFileSync, existsSync } from 'node:fs';

// SEC-04 AC-1: every workflow, in .github/workflows and in the pipeline/ folder Hugo copies from,
// pins actions by commit SHA and declares least-privilege permissions.
const dirs = ['.github/workflows', 'pipeline/github/workflows'].filter(existsSync);
const files = dirs.flatMap((d) => readdirSync(d).filter((f) => /\.ya?ml$/.test(f)).map((f) => `${d}/${f}`));

const expected = ['approval', 'ci', 'dast', 'deploy-preview', 'deploy-production', 'deploy-staging', 'media', 'preview-build', 'security'];

test('SEC-04 AC-1: the workflows listed in DELIVERY.md exist in the pipeline folder', () => {
  for (const name of expected) expect(existsSync(`pipeline/github/workflows/${name}.yml`), name).toBe(true);
});

for (const file of files) {
  const text = readFileSync(file, 'utf8');
  test(`SEC-04 AC-1: ${file} pins actions by SHA`, () => {
    const uses = [...text.matchAll(/^\s*-?\s*uses:\s*(\S+)/gm)].map((m) => m[1]).filter((u) => !u.startsWith('./'));
    for (const u of uses) expect(u, u).toMatch(/^[\w.-]+\/[\w./-]+@[0-9a-f]{40}$/);
  });
  test(`SEC-04 AC-1: ${file} declares permissions and no write-all`, () => {
    expect(text).toMatch(/^permissions:/m);
    expect(text).not.toMatch(/write-all/);
    expect(text).not.toMatch(/^\s*pull_request_target:[\s\S]*?actions\/checkout[^\n]*\n\s+with:\s*\n\s+ref:\s*\$\{\{\s*github\.event\.pull_request\.head/m);
  });
  test(`SEC-04 AC-1: ${file} never interpolates PR-controlled text into shell`, () => {
    const runs = [...text.matchAll(/^\s*run:\s*[|>]?-?\s*\n?((?:\s+.*\n?)*)/gm)].map((m) => m[0]).join('\n');
    expect(runs).not.toMatch(/\$\{\{\s*github\.event\.(pull_request\.(title|body|head\.ref)|head_commit\.message|workflow_run\.(head_branch|display_title))/);
  });
}
