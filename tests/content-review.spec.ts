import { test, expect } from '@playwright/test';
import { readFileSync, readdirSync } from 'node:fs';
import { parse } from 'yaml';

// Stage 08 content review drafts: CONT-02, CONT-04, CONT-05, I18N-01, LEGAL-02.
// The drafts live in docs/content-review/ as YAML (Markdown there would break the English-only rule of AGENTS.md).
type Bilingual = { es?: unknown; en?: unknown };
type Photo = { nasaId: string; chapter: string; title: Bilingual; caption: Bilingual; alt: Bilingual; sources: string[]; story?: Bilingual & { sources?: string[] } };
type Block = Bilingual & { id: string; sources?: string[]; title?: Bilingual };
type Sections = {
  sections: Record<string, { title: Bilingual; intro?: Block; blocks?: Block[]; timeline?: Block[]; crew?: Block[]; milestones?: Block[] }>;
  open_decisions: Block[];
  omitted_facts: Block[];
};

const dir = 'docs/content-review';
const photoDrafts = (parse(readFileSync(`${dir}/photos.yaml`, 'utf8')) as { photos: Photo[] }).photos;
const sections = parse(readFileSync(`${dir}/sections.yaml`, 'utf8')) as Sections;
const approved = readdirSync('src/content/photos').map((f) => JSON.parse(readFileSync(`src/content/photos/${f}`, 'utf8')) as { nasaId: string; chapter: string });

const isText = (value: unknown) => typeof value === 'string' && value.trim().length > 0;
const isHttps = (value: unknown) => typeof value === 'string' && /^https:\/\/[^\s]+$/.test(value);
const bothLanguages = (value: Bilingual | undefined) => !!value && isText(value.es) && isText(value.en) && value.es !== value.en;
const sectionBlocks = Object.values(sections.sections).flatMap((s) => [s.intro, ...(s.blocks ?? []), ...(s.timeline ?? []), ...(s.crew ?? []), ...(s.milestones ?? [])]).filter((b): b is Block => !!b);

test.describe('AC-1 section texts in both languages with a source next to every fact (CONT-02, I18N-01)', () => {
  test('AC-1 the three sections exist with a title in both languages', () => {
    expect(Object.keys(sections.sections).sort()).toEqual(['launch', 'mission', 'why-it-matters']);
    for (const section of Object.values(sections.sections)) expect(bothLanguages(section.title)).toBe(true);
  });

  test('AC-1 every block has Spanish and English text that differ and at least one https source', () => {
    expect(sectionBlocks.length).toBeGreaterThan(20);
    for (const block of sectionBlocks) {
      expect(bothLanguages(block), `${block.id}: both languages`).toBe(true);
      expect(block.sources?.length ?? 0, `${block.id}: sources`).toBeGreaterThan(0);
      for (const url of block.sources ?? []) expect(isHttps(url), `${block.id}: ${url}`).toBe(true);
    }
  });

  test('AC-1 the mission section has a timeline, the crew and milestones', () => {
    const mission = sections.sections['mission']!;
    expect(mission.timeline!.length).toBeGreaterThanOrEqual(5);
    expect(mission.crew).toHaveLength(4);
    expect(mission.milestones!.length).toBeGreaterThan(0);
    for (const item of mission.timeline!) {
      expect(String(item['date' as keyof Block])).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(bothLanguages(item.title), `${item.id}: title`).toBe(true);
    }
  });
});

test.describe('AC-2 photo drafts (CONT-04, CONT-05)', () => {
  test('AC-2 every approved photo has exactly one draft and no draft is for an unknown photo', () => {
    const ids = photoDrafts.map((p) => p.nasaId);
    expect(new Set(ids).size).toBe(ids.length);
    expect([...ids].sort()).toEqual(approved.map((p) => p.nasaId).sort());
    for (const photo of photoDrafts) expect(photo.chapter, photo.nasaId).toBe(approved.find((p) => p.nasaId === photo.nasaId)!.chapter);
  });

  test('AC-2 every photo has title, caption and alt text in both languages and a source', () => {
    for (const photo of photoDrafts) {
      for (const field of ['title', 'caption', 'alt'] as const) expect(bothLanguages(photo[field]), `${photo.nasaId}: ${field}`).toBe(true);
      expect(photo.sources.length, `${photo.nasaId}: sources`).toBeGreaterThan(0);
      for (const url of photo.sources) expect(isHttps(url), `${photo.nasaId}: ${url}`).toBe(true);
      expect(photo.sources.some((url) => url.startsWith('https://images.nasa.gov/details/')), `${photo.nasaId}: NASA record`).toBe(true);
    }
  });

  test('AC-2 stories exist only with both languages and their own sources, and every chapter has one', () => {
    const withStory = photoDrafts.filter((p) => p.story);
    expect(withStory.length).toBeGreaterThan(0);
    for (const photo of withStory) {
      expect(bothLanguages(photo.story), `${photo.nasaId}: story`).toBe(true);
      expect(photo.story!.sources?.length ?? 0, `${photo.nasaId}: story sources`).toBeGreaterThan(0);
      for (const url of photo.story!.sources ?? []) expect(isHttps(url), `${photo.nasaId}: ${url}`).toBe(true);
    }
    expect(new Set(withStory.map((p) => p.chapter)).size).toBe(5);
  });
});

test.describe('AC-3 open decisions and omitted facts are listed (CONT-03)', () => {
  test('AC-3 open decisions and omitted facts are in both languages', () => {
    expect(sections.open_decisions.length).toBeGreaterThan(0);
    expect(sections.omitted_facts.length).toBeGreaterThan(0);
    for (const item of [...sections.open_decisions, ...sections.omitted_facts]) expect(bothLanguages(item), item.id).toBe(true);
  });
});

test.describe('AC-4 no logo, endorsement wording or unsourced quote (LEGAL-02, CONT-04)', () => {
  test('AC-4 the drafts contain no logo or endorsement wording', () => {
    const text = [readFileSync(`${dir}/photos.yaml`, 'utf8'), readFileSync(`${dir}/sections.yaml`, 'utf8')].join('\n').toLowerCase();
    for (const word of ['nasa logo', 'logo de la nasa', 'worm', 'meatball', 'endorsed by', 'respaldado por la nasa', 'aprobado por la nasa', 'official partner']) expect(text, word).not.toContain(word);
  });

  test('AC-4 quoted text appears only where the NASA record gives it', () => {
    const strings: string[] = [];
    const collect = (value: unknown): void => {
      if (typeof value === 'string') strings.push(value);
      else if (Array.isArray(value)) value.forEach(collect);
      else if (value && typeof value === 'object') Object.values(value).forEach(collect);
    };
    collect(photoDrafts);
    collect(sections);
    const quotes = strings.flatMap((text) => [...text.matchAll(/«([^»]+)»|"([^"]+)"/g)].map((m) => (m[1] ?? m[2]!).replace(/[.,]$/, '').toLowerCase()));
    const allowed = new Set(['anything but a straight line', 'todo menos una línea recta', 'islands', 'islas', 'the kiss', 'el beso']);
    expect(quotes.length).toBeGreaterThan(0);
    for (const quote of quotes) expect(allowed.has(quote), quote).toBe(true);
  });
});

test.describe('AC-5 the repository keeps drafts out of Markdown', () => {
  test('AC-5 docs/content-review contains no Markdown file and only the two YAML drafts', () => {
    const files = readdirSync(dir);
    expect(files.filter((f) => f.toLowerCase().endsWith('.md'))).toEqual([]);
    expect(files.sort()).toEqual(['photos.yaml', 'sections.yaml']);
  });
});
