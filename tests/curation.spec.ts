import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';

// Stage 05 AC-1 and AC-2: CURATION.md is a review document, validated as data (CONT-01, CONT-02, CONT-03).
const doc = readFileSync(new URL('../CURATION.md', import.meta.url), 'utf8');
const chapters = ['launch', 'outbound', 'far-side', 'eclipse', 'return'];
const originalUrl = /^https:\/\/images-assets\.nasa\.gov\/image\/[^\s)]+$/;
const recordUrl = /^https:\/\/images\.nasa\.gov\/details\/[^\s)]+$/;

type Candidate = { nasaId: string; chapter: string; record: string; original: string; bytes: number; why: string };

function section(heading: RegExp): { heading: string; rows: Candidate[] } {
  const lines = doc.split('\n');
  const start = lines.findIndex((l) => l.startsWith('## ') && heading.test(l));
  expect(start, `section ${heading}`).toBeGreaterThan(-1);
  const rows: Candidate[] = [];
  for (const line of lines.slice(start + 1)) {
    if (line.startsWith('## ')) break;
    const cells = line.split(/\s\|\s/).map((c) => c.replace(/^\|\s*|\s*\|$/g, '').trim());
    if (!/^\d+$/.test(cells[0] ?? '')) continue;
    const link = (cell = '') => /\]\(([^)]+)\)/.exec(cell)?.[1] ?? '';
    rows.push({
      nasaId: /^`(.+)`$/.exec(cells[1] ?? '')?.[1] ?? '',
      chapter: cells[2] ?? '',
      record: link(cells[4]),
      original: link(cells[5]),
      bytes: Number((cells[6] ?? '').replace(/,/g, '')),
      why: cells.slice(8).join(' | '),
    });
  }
  return { heading: lines[start] ?? '', rows };
}

const mission = section(/^## Mission candidates/);
const launch = section(/^## Launch candidates/);

test.describe('Stage 05 curation document (CONT-01, CONT-02)', () => {
  test('AC-1 CONT-01 mission candidates are 20-30 and state their count', () => {
    expect(mission.rows.length).toBeGreaterThanOrEqual(20);
    expect(mission.rows.length).toBeLessThanOrEqual(30);
    expect(mission.heading).toContain(`(${mission.rows.length})`);
  });

  test('AC-1 CONT-01 launch candidates are 5-8, all in the launch chapter, and state their count', () => {
    expect(launch.rows.length).toBeGreaterThanOrEqual(5);
    expect(launch.rows.length).toBeLessThanOrEqual(8);
    expect(launch.heading).toContain(`(${launch.rows.length})`);
    for (const row of launch.rows) expect(row.chapter).toBe('launch');
  });

  test('AC-1 CONT-01 NASA IDs are unique across both groups', () => {
    const ids = [...mission.rows, ...launch.rows].map((r) => r.nasaId);
    expect(ids.every((id) => id.length > 0)).toBe(true);
    expect(new Set(ids).size).toBe(ids.length);
  });

  test('AC-2 CONT-02 every candidate has a source page, an original URL, a chapter and a rationale', () => {
    for (const row of [...mission.rows, ...launch.rows]) {
      expect(row.record, row.nasaId).toMatch(recordUrl);
      expect(row.original, row.nasaId).toMatch(originalUrl);
      expect(Number.isInteger(row.bytes) && row.bytes > 0, `${row.nasaId} bytes`).toBe(true);
      expect(chapters, row.nasaId).toContain(row.chapter);
      expect(row.why.length, `${row.nasaId} rationale`).toBeGreaterThan(20);
    }
  });

  test('AC-2 CONT-03 mission candidates cover every mission chapter', () => {
    const covered = new Set(mission.rows.map((r) => r.chapter));
    for (const chapter of chapters.filter((c) => c !== 'launch')) expect(covered.has(chapter), chapter).toBe(true);
  });

  test('AC-3 CONT-06 the document links the NASA usage guidance and records the third-party exclusion result', () => {
    expect(doc).toContain('https://www.nasa.gov/nasa-brand-center/images-and-media/');
    expect(doc).toMatch(/Excluded for third-party rights/);
  });
});
