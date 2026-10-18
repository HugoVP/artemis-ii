import test from 'node:test';
import assert from 'node:assert/strict';
import { approvalRulesetIssues } from './approval-ruleset.ts';

const appId = 123456;
const ruleset = {
  target: 'branch', enforcement: 'active', bypass_actors: [],
  conditions: { ref_name: { include: ['~DEFAULT_BRANCH'], exclude: [] } },
  rules: [{ type: 'pull_request' }, { type: 'required_status_checks', parameters: {
    required_status_checks: [{ context: 'approval', integration_id: appId }],
  } }],
};

test('OPS-06: an active main ruleset accepts approval only from its dedicated App', () => {
  assert.deepEqual(approvalRulesetIssues(ruleset, appId), []);
});

for (const source of [null, 0, 15368, 654321]) {
  test(`OPS-06: approval from any source, GitHub Actions or another App is refused (${source})`, () => {
    const changed = { ...ruleset, rules: [{ type: 'pull_request' }, { type: 'required_status_checks', parameters: {
      required_status_checks: [{ context: 'approval', integration_id: source }],
    } }] };
    assert.ok(approvalRulesetIssues(changed, appId).length > 0);
  });
}

test('OPS-06: disabled rules, bypasses, exclusions, missing checks and invalid App IDs fail verification', () => {
  for (const changed of [
    { ...ruleset, enforcement: 'evaluate' },
    { ...ruleset, bypass_actors: [{ actor_id: 1 }] },
    { ...ruleset, conditions: { ref_name: { include: ['refs/heads/main'], exclude: ['refs/heads/main'] } } },
    { ...ruleset, rules: [] },
  ]) assert.ok(approvalRulesetIssues(changed, appId).length > 0);
  assert.ok(approvalRulesetIssues(ruleset, Number.NaN).length > 0);
  assert.ok(approvalRulesetIssues(ruleset, 15368).length > 0);
  assert.ok(approvalRulesetIssues({}, appId).length > 0);
});
