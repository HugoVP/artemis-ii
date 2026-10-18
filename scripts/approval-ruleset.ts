import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const record = (value: unknown): Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};

// Inspect a downloaded ruleset only; this helper never calls GitHub or changes settings.
export function approvalRulesetIssues(value: unknown, appId: number): readonly string[] {
  const issues: string[] = [];
  const ruleset = record(value);
  if (!Number.isSafeInteger(appId) || appId <= 0 || appId === 15368) issues.push('Expected the dedicated approval App ID, not GitHub Actions');
  if (ruleset.target !== 'branch' || ruleset.enforcement !== 'active') issues.push('Ruleset must actively protect branches');
  const refs = record(record(ruleset.conditions).ref_name);
  if (!Array.isArray(refs.include) || !refs.include.some(ref => ref === '~DEFAULT_BRANCH' || ref === 'refs/heads/main') ||
      !Array.isArray(refs.exclude) || refs.exclude.length !== 0) issues.push('Ruleset must include main without exclusions');
  if (!Array.isArray(ruleset.bypass_actors) || ruleset.bypass_actors.length !== 0) issues.push('Ruleset must have an empty bypass list');
  const rules = Array.isArray(ruleset.rules) ? ruleset.rules.map(record) : [];
  if (!rules.some(rule => rule.type === 'pull_request')) issues.push('Ruleset must require a pull request');
  const checks = rules.filter(rule => rule.type === 'required_status_checks')
    .flatMap(rule => {
      const checks = record(rule.parameters).required_status_checks;
      return Array.isArray(checks) ? checks.map(record) : [];
    }).filter(check => check.context === 'approval');
  if (checks.length === 0 || checks.some(check => check.integration_id !== appId)) {
    issues.push('Required approval must accept only the dedicated approval App ID, never any source or GitHub Actions');
  }
  return issues;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const [file, id] = process.argv.slice(2);
    if (!file || !id) throw new Error('Usage: node scripts/approval-ruleset.ts <ruleset.json> <approval-app-id>');
    const value: unknown = JSON.parse(readFileSync(file, 'utf8'));
    const issues = approvalRulesetIssues(value, Number(id));
    if (issues.length) throw new Error(issues.join('\n'));
    process.stdout.write('Approval ruleset source and main protections verified.\n');
  } catch (error: unknown) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}
