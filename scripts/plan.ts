// The stage table of docs/PLAN.md. Its own module, with no top-level await and no imports, so that the work-order script,
// the orchestrator and the checks can all read it without importing each other in a cycle.

// One row of the stage table of docs/PLAN.md.
export interface Stage {
  number: string;
  name: string;
  needs: string[];
  specPath: string | null;
  status: string;
  pr: string;
  linear: string | null;
  // The symbols before the name: 🔍 for a content review stage, 🎨 for a design stage.
  marker?: string;
}

export function parseStages(markdown: string): Stage[] {
  const rows: Stage[] = [];
  for (const line of markdown.split(/^## /m)[0].split("\n")) {
    if (!line.startsWith("|")) continue;
    const c = line.split("|").slice(1, -1).map((s) => s.trim());
    if (c.length < 7 || !/^\d\d$/.test(c[0])) continue;
    const link = c[3].match(/\]\(([^)]+)\)/);
    rows.push({
      number: c[0],
      name: c[1].replace(/^[^\p{L}\p{N}]+/u, "").trim(),
      needs: [...c[2].matchAll(/`([^`]+)`/g)].map((m) => m[1]),
      specPath: link ? link[1].replace(/^\.?\/?/, "") : null,
      status: c[4],
      pr: c[5],
      linear: c[6].match(/HUG-\d+/)?.[0] ?? null,
      marker: (c[1].match(/^[^\p{L}\p{N}]+/u)?.[0] ?? "").trim(),
    });
  }
  return rows;
}
