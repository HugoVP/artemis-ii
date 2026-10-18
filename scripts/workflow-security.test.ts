import test from 'node:test';
import assert from 'node:assert/strict';
import { extractRunScripts, unsafePrInterpolation } from './workflow-security.ts';

const workflowWith = (step: string) => `jobs:\n  build:\n    steps:\n${step}\n`;

for (const [style, step] of [
  ['inline list', '      - run: echo "${{ github.event.pull_request.title }}"'],
  ['block list', '      - run: |\n          echo "${{ github.event.pull_request.title }}"'],
  ['named step', '      - name: Title\n        run: echo "${{ github.event.pull_request.title }}"'],
  ['folded block', '      - run: >-\n          echo\n          "${{ github.event.pull_request.title }}"'],
  ['quoted scalar', '      - run: "echo \\u0024{{ github.event.pull_request.title }}"'],
] as const) {
  test(`SEC-04: unsafe interpolation is detected in a ${style} run scalar`, () => {
    const scripts = extractRunScripts(workflowWith(step));
    assert.equal(scripts.length, 1);
    assert.match(scripts[0]!, unsafePrInterpolation);
  });
}

test('SEC-04: environment bindings and display names are not executed as shell code', () => {
  const source = workflowWith('      - name: ${{ github.event.pull_request.title }}\n        env:\n          TITLE: ${{ github.event.pull_request.title }}\n        run: echo "$TITLE"');
  assert.deepEqual(extractRunScripts(source), ['echo "$TITLE"']);
  assert.doesNotMatch(extractRunScripts(source)[0]!, unsafePrInterpolation);
});

test('SEC-04: malformed YAML, duplicate run keys and non-string commands fail validation', () => {
  assert.throws(() => extractRunScripts('jobs: [broken'));
  assert.throws(() => extractRunScripts(workflowWith('      - run: echo first\n        run: echo second')));
  assert.throws(() => extractRunScripts(workflowWith('      - run: [echo, bad]')));
});
