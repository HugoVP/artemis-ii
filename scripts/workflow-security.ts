import { parse } from 'yaml';

export const unsafePrInterpolation = /\$\{\{\s*github\.event\.(pull_request\.(title|body|head\.ref)|head_commit\.message|workflow_run\.(head_branch|display_title))/;

function mapping(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown> : undefined;
}

// Parse YAML scalars so list steps, quoting, aliases and block styles have their actual values.
export function extractRunScripts(source: string): readonly string[] {
  const document: unknown = parse(source, { uniqueKeys: true });
  const jobs = mapping(mapping(document)?.jobs);
  if (!jobs) throw new Error('Workflow must define a jobs mapping');
  const scripts: string[] = [];
  for (const value of Object.values(jobs)) {
    const steps = mapping(value)?.steps;
    if (steps === undefined) continue; // Reusable workflow jobs have no steps.
    if (!Array.isArray(steps)) throw new Error('Workflow steps must be a sequence');
    for (const value of steps) {
      const step = mapping(value);
      if (!step || !Object.hasOwn(step, 'run')) continue;
      if (typeof step.run !== 'string') throw new Error('Workflow run must be a string');
      scripts.push(step.run);
    }
  }
  return scripts;
}
