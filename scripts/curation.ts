// Parses the candidate tables of CURATION.md. Shared by tests/curation.spec.ts and scripts/ingest.ts.
export interface Candidate {
  nasaId: string;
  chapter: string;
  record: string;
  original: string;
  bytes: number;
  creditUrl?: string;
  creditLabel?: string;
  why: string;
}
export interface CurationSection { heading: string; rows: Candidate[] }

export function parseSection(doc: string, heading: RegExp): CurationSection {
  const lines = doc.split(/\r?\n/);
  const start = lines.findIndex((l) => l.startsWith('## ') && heading.test(l));
  if (start < 0) throw new Error(`CURATION.md has no section ${heading}`);
  const rows: Candidate[] = [];
  for (const line of lines.slice(start + 1)) {
    if (line.startsWith('## ')) break;
    const cells = line.split(/\s\|\s/).map((c) => c.replace(/^\|\s*|\s*\|$/g, '').trim());
    if (!/^\d+$/.test(cells[0] ?? '')) continue;
    const link = (cell = '') => /\]\(([^)]+)\)/.exec(cell)?.[1] ?? '';
    const label = (cell = '') => /\[([^\]]+)\]\([^)]+\)/.exec(cell)?.[1] ?? '';
    const creditUrl = link(cells[7]) || undefined;
    const creditLabel = creditUrl ? (label(cells[7]) || undefined) : undefined;
    rows.push({
      nasaId: /^`(.+)`$/.exec(cells[1] ?? '')?.[1] ?? '',
      chapter: cells[2] ?? '',
      record: link(cells[4]),
      original: link(cells[5]),
      bytes: Number((cells[6] ?? '').replace(/,/g, '')),
      ...(creditUrl ? { creditUrl, creditLabel } : {}),
      why: cells.slice(8).join(' | '),
    });
  }
  return { heading: lines[start] ?? '', rows };
}

export function parseCuration(doc: string): { mission: CurationSection; launch: CurationSection } {
  return {
    mission: parseSection(doc, /^## Mission candidates/),
    launch: parseSection(doc, /^## Launch candidates/),
  };
}
