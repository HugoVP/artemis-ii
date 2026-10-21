import { test, expect } from '@playwright/test';
import { readFileSync, readdirSync } from 'node:fs';
import { parse } from 'yaml';
import { parseCuration } from '../scripts/curation.ts';
import { pathKeyFor } from '../scripts/pages-media.ts';
import { bilingual, chapterIds, sourceSchema } from '../src/content/schemas.ts';
import { sectionPath } from '../src/i18n/routes.ts';

interface FactSource {
  title: string;
  url: string;
  accessed: string;
}

interface FactEntry {
  id: string;
  claim: { es: string; en: string };
  sources: FactSource[];
}

interface LaunchPhaseDraft {
  id: string;
  order: number;
  timeLabel: { es: string; en: string };
  title: { es: string; en: string };
  description: { es: string; en: string };
  facts: FactEntry[];
}

interface TimelineItemDraft {
  id: string;
  order: number;
  dateLabel: { es: string; en: string };
  title: { es: string; en: string };
  description: { es: string; en: string };
  facts: FactEntry[];
}

interface CrewMemberDraft {
  id: string;
  name: string;
  agency: string;
  role: { es: string; en: string };
  photoId: string;
  bio: { es: string; en: string };
  facts: FactEntry[];
}

interface MilestoneDraft {
  id: string;
  title: { es: string; en: string };
  description: { es: string; en: string };
  facts: FactEntry[];
}

interface SectionsReviewDoc {
  schemaVersion: number;
  reviewedAt: string;
  sections: {
    launch: {
      slug: { es: string; en: string };
      title: { es: string; en: string };
      intro: { es: string; en: string };
      dateLine: { es: string; en: string };
      summary: { es: string; en: string };
      phasesTitle: { es: string; en: string };
      phases: LaunchPhaseDraft[];
      video: {
        title: { es: string; en: string };
        description: { es: string; en: string };
        playLabel: { es: string; en: string };
        privacyNote: { es: string; en: string };
        nasaId: string;
        recordUrl: string;
        mp4Url: string;
        posterPhotoId: string;
        sources: FactSource[];
      };
      photosSection: {
        title: { es: string; en: string };
        intro: { es: string; en: string };
      };
      facts: FactEntry[];
    };
    mission: {
      slug: { es: string; en: string };
      title: { es: string; en: string };
      intro: { es: string; en: string };
      timelineTitle: { es: string; en: string };
      timeline: TimelineItemDraft[];
      crewTitle: { es: string; en: string };
      crew: CrewMemberDraft[];
      milestonesTitle: { es: string; en: string };
      milestonesIntro: { es: string; en: string };
      milestones: MilestoneDraft[];
      facts: FactEntry[];
    };
    'why-it-matters': {
      slug: { es: string; en: string };
      title: { es: string; en: string };
      heroPhotoId: string;
      intro: { es: string; en: string };
      programTitle: { es: string; en: string };
      programBody: { es: string; en: string };
      nextTitle: { es: string; en: string };
      nextBody: { es: string; en: string };
      sourcesLabel: { es: string; en: string };
      facts: FactEntry[];
    };
  };
  supporting: {
    home: {
      heading: { es: string; en: string };
      welcome: { es: string; en: string };
      featuredPhotoId: string;
      cards: Record<string, { es: string; en: string }>;
    };
    chapters: Record<string, { order: number; title: { es: string; en: string }; summary: { es: string; en: string } }>;
    references: Record<string, { facts?: string[]; derivedFrom?: string[] }>;
  };
  openDecisions: Array<{
    id: string;
    item: string;
    summary: string;
    proposedHandling: string;
    sources: string[];
  }>;
  omittedUnverifiableFacts: Array<{
    id: string;
    description: string;
    reason: string;
  }>;
}

interface PhotoStoryDraft {
  es: string;
  en: string;
  facts: FactEntry[];
}

interface PhotoDraft {
  nasaId: string;
  mediaFolder: string;
  curationRef: string;
  chapter: (typeof chapterIds)[number];
  displayOrder: number;
  date: string | null;
  dateConflict?: {
    status: 'open' | 'resolved-per-caption';
    summary: string;
    proposedResolution: string;
    sources: string[];
  };
  camera: string | null;
  credit: string;
  originalUrl: string;
  title: { es: string; en: string };
  caption: { es: string; en: string };
  alt: { es: string; en: string };
  story?: PhotoStoryDraft;
  facts: FactEntry[];
}

interface PhotosReviewDoc {
  schemaVersion: number;
  reviewedAt: string;
  totalPhotos: number;
  photos: PhotoDraft[];
}

const reviewDir = new URL('../docs/content-review/', import.meta.url);
const sectionsDoc = parse(readFileSync(new URL('sections.yaml', reviewDir), 'utf8')) as SectionsReviewDoc;
const photosDoc = parse(readFileSync(new URL('photos.yaml', reviewDir), 'utf8')) as PhotosReviewDoc;
const curationDoc = readFileSync(new URL('../CURATION.md', import.meta.url), 'utf8');
const { mission: curatedMission, launch: curatedLaunch } = parseCuration(curationDoc);
const curatedRows = [...curatedLaunch.rows, ...curatedMission.rows];

function assertBilingualText(value: unknown, label: string, minLength = 10): void {
  const parsed = bilingual.safeParse(value);
  expect(parsed.success, `${label} must have non-empty es and en strings`).toBe(true);
  if (parsed.success) {
    expect(parsed.data.es.trim().length, `${label}.es min length`).toBeGreaterThanOrEqual(minLength);
    expect(parsed.data.en.trim().length, `${label}.en min length`).toBeGreaterThanOrEqual(minLength);
    expect(parsed.data.es.trim(), `${label} es and en must not be identical`).not.toBe(parsed.data.en.trim());
  }
}

function assertFactsHaveSources(facts: FactEntry[], contextLabel: string): void {
  expect(Array.isArray(facts) && facts.length > 0, `${contextLabel} must have at least one fact`).toBe(true);
  for (const fact of facts) {
    expect(typeof fact.id === 'string' && fact.id.length > 0, `${contextLabel} fact.id`).toBe(true);
    assertBilingualText(fact.claim, `${contextLabel} fact(${fact.id}).claim`, 15);
    expect(Array.isArray(fact.sources) && fact.sources.length > 0, `${contextLabel} fact(${fact.id}) sources`).toBe(true);
    for (const src of fact.sources) {
      const check = sourceSchema.safeParse(src);
      expect(check.success, `${contextLabel} fact(${fact.id}) source ${JSON.stringify(src)}`).toBe(true);
      expect(src.url.startsWith('https://'), `${contextLabel} fact(${fact.id}) HTTPS URL`).toBe(true);
    }
  }
}

test.describe('Stage 08 content review YAML files (CONT-02, CONT-03, CONT-04, CONT-05, I18N-01, LEGAL-01, LEGAL-02)', () => {
  test('AC-1 docs/content-review contains only structured YAML files and no Markdown files', () => {
    const files = readdirSync(reviewDir);
    expect(files.filter((f) => f.endsWith('.md'))).toEqual([]);
    expect(files.sort()).toEqual(['photos.yaml', 'sections.yaml']);
  });

  test('AC-1 CONT-02 I18N-01 the three section texts exist in Spanish and English with sources on every fact', () => {
    expect(Object.keys(sectionsDoc.sections).sort()).toEqual(['launch', 'mission', 'why-it-matters']);
    for (const id of ['launch', 'mission', 'why-it-matters'] as const) {
      expect(`/${'es'}/${sectionsDoc.sections[id].slug.es}/`).toBe(sectionPath('es', id));
      expect(`/${'en'}/${sectionsDoc.sections[id].slug.en}/`).toBe(sectionPath('en', id));
    }

    // 1. The launch
    const launch = sectionsDoc.sections.launch;
    assertBilingualText(launch.title, 'launch.title', 3);
    assertBilingualText(launch.intro, 'launch.intro', 40);
    assertBilingualText(launch.dateLine, 'launch.dateLine', 20);
    assertBilingualText(launch.summary, 'launch.summary', 200);
    assertBilingualText(launch.phasesTitle, 'launch.phasesTitle', 5);
    expect(launch.phases.length).toBeGreaterThanOrEqual(3);
    for (const phase of launch.phases) {
      assertBilingualText(phase.timeLabel, `launch.${phase.id}.timeLabel`, 5);
      assertBilingualText(phase.title, `launch.${phase.id}.title`, 10);
      assertBilingualText(phase.description, `launch.${phase.id}.description`, 50);
      assertFactsHaveSources(phase.facts, `launch.${phase.id}`);
    }
    assertBilingualText(launch.video.title, 'launch.video.title', 5);
    assertBilingualText(launch.video.description, 'launch.video.description', 30);
    assertBilingualText(launch.video.playLabel, 'launch.video.playLabel', 5);
    assertBilingualText(launch.video.privacyNote, 'launch.video.privacyNote', 15);
    expect(launch.video.recordUrl).toMatch(/^https:\/\/images\.nasa\.gov\/details\//);
    expect(launch.video.mp4Url).toMatch(/^https:\/\/images-assets\.nasa\.gov\/video\//);
    expect(launch.video.sources.length).toBeGreaterThanOrEqual(1);
    assertFactsHaveSources(launch.facts, 'launch.facts');

    // 2. The mission (timeline, crew, milestones)
    const mission = sectionsDoc.sections.mission;
    assertBilingualText(mission.title, 'mission.title', 3);
    assertBilingualText(mission.intro, 'mission.intro', 100);
    assertBilingualText(mission.timelineTitle, 'mission.timelineTitle', 4);
    expect(mission.timeline.length).toBeGreaterThanOrEqual(6);
    for (const item of mission.timeline) {
      assertBilingualText(item.dateLabel, `mission.${item.id}.dateLabel`, 8);
      assertBilingualText(item.title, `mission.${item.id}.title`, 10);
      assertBilingualText(item.description, `mission.${item.id}.description`, 60);
      assertFactsHaveSources(item.facts, `mission.${item.id}`);
    }
    expect(mission.crew.map((c) => c.name)).toEqual([
      'Reid Wiseman',
      'Victor Glover',
      'Christina Koch',
      'Jeremy Hansen',
    ]);
    for (const member of mission.crew) {
      assertBilingualText(member.role, `mission.crew.${member.id}.role`, 5);
      assertBilingualText(member.bio, `mission.crew.${member.id}.bio`, 50);
      assertFactsHaveSources(member.facts, `mission.crew.${member.id}`);
    }
    expect(mission.milestones.length).toBeGreaterThanOrEqual(3);
    for (const milestone of mission.milestones) {
      assertBilingualText(milestone.title, `mission.${milestone.id}.title`, 10);
      assertBilingualText(milestone.description, `mission.${milestone.id}.description`, 60);
      assertFactsHaveSources(milestone.facts, `mission.${milestone.id}`);
    }
    assertFactsHaveSources(mission.facts, 'mission.facts');

    // 3. Why it matters
    const why = sectionsDoc.sections['why-it-matters'];
    assertBilingualText(why.title, 'why.title', 5);
    assertBilingualText(why.intro, 'why.intro', 100);
    assertBilingualText(why.programTitle, 'why.programTitle', 5);
    assertBilingualText(why.programBody, 'why.programBody', 100);
    assertBilingualText(why.nextTitle, 'why.nextTitle', 5);
    assertBilingualText(why.nextBody, 'why.nextBody', 100);
    assertFactsHaveSources(why.facts, 'why.facts');
  });


  test('AC-1 CONT-02 I18N-01 the supporting Home and chapter drafts are bilingual and every text points to existing sourced facts', () => {
    const { home, chapters, references } = sectionsDoc.supporting;
    const ids = new Set<string>();
    const collect = (value: unknown): void => {
      if (Array.isArray(value)) value.forEach(collect);
      else if (value && typeof value === 'object') {
        const record = value as Record<string, unknown>;
        if (typeof record.id === 'string' && record.claim && Array.isArray(record.sources) && record.sources.length > 0) ids.add(record.id);
        Object.values(record).forEach(collect);
      }
    };
    collect(sectionsDoc.sections);
    collect(photosDoc.photos);

    assertBilingualText(home.heading, 'supporting.home.heading', 5);
    assertBilingualText(home.welcome, 'supporting.home.welcome', 60);
    expect(Object.keys(home.cards).sort()).toEqual(['gallery', 'launch', 'mission', 'why-it-matters']);
    for (const [name, card] of Object.entries(home.cards)) assertBilingualText(card, `supporting.home.cards.${name}`, 40);
    expect(photosDoc.photos.some((photo) => JSON.stringify(photo).includes(home.featuredPhotoId)), 'featuredPhotoId names one of the 33 photos (its NASA id appears in the photo record)').toBe(true);

    expect(Object.keys(chapters)).toEqual([...chapterIds]);
    chapterIds.forEach((id, index) => {
      expect(chapters[id].order, `supporting.chapters.${id}.order`).toBe(index + 1);
      // A short title can be the same word in both languages ("Eclipse"), so only its presence is checked.
      const title = bilingual.safeParse(chapters[id].title);
      expect(title.success, `supporting.chapters.${id}.title must have non-empty es and en strings`).toBe(true);
      assertBilingualText(chapters[id].summary, `supporting.chapters.${id}.summary`, 80);
    });

    // Every text has a reference: sourced facts that exist, or the file it is derived from. Nothing is left unreferenced.
    const texts = ['home.welcome', ...Object.keys(home.cards).map((name) => `home.cards.${name}`), ...chapterIds.map((id) => `chapters.${id}.summary`)];
    expect(Object.keys(references).sort()).toEqual([...texts].sort());
    for (const key of texts) {
      const ref = references[key]!;
      expect(Boolean(ref.facts?.length) !== Boolean(ref.derivedFrom?.length), `${key} has facts or derivedFrom, not both and not neither`).toBe(true);
      for (const id of ref.facts ?? []) expect(ids.has(id), `${key} references the unknown or unsourced fact "${id}"`).toBe(true);
      expect(new Set(ref.facts ?? []).size, `${key} has no duplicate fact ids`).toBe((ref.facts ?? []).length);
      for (const file of ref.derivedFrom ?? []) expect(file).toBe('docs/content-review/photos.yaml');
    }
    // The gallery card states a count that photos.yaml proves.
    expect(photosDoc.photos).toHaveLength(33);
    expect(new Set(photosDoc.photos.map((photo) => photo.chapter))).toEqual(new Set(chapterIds));
  });

  test('AC-2 CONT-04 CONT-05 all 33 curated photos have bilingual title, caption, alt text, and sourced facts', () => {
    expect(photosDoc.totalPhotos).toBe(33);
    expect(photosDoc.photos.length).toBe(33);

    const expectedIds = new Set(curatedRows.map((r) => r.nasaId));
    const actualIds = photosDoc.photos.map((p) => p.nasaId);
    expect(new Set(actualIds)).toEqual(expectedIds);

    for (const photo of photosDoc.photos) {
      const curated = curatedRows.find((r) => r.nasaId === photo.nasaId)!;
      expect(photo.mediaFolder, `${photo.nasaId} mediaFolder`).toBe(pathKeyFor(photo.nasaId));
      expect(photo.chapter, `${photo.nasaId} chapter`).toBe(curated.chapter);
      expect(photo.originalUrl, `${photo.nasaId} originalUrl`).toBe(curated.original);
      expect(photo.credit, `${photo.nasaId} credit`).toMatch(/^NASA/);

      assertBilingualText(photo.title, `photo(${photo.nasaId}).title`, 10);
      assertBilingualText(photo.caption, `photo(${photo.nasaId}).caption`, 50);
      assertBilingualText(photo.alt, `photo(${photo.nasaId}).alt`, 30);
      assertFactsHaveSources(photo.facts, `photo(${photo.nasaId}).facts`);

      if (photo.story !== undefined) {
        assertBilingualText({ es: photo.story.es, en: photo.story.en }, `photo(${photo.nasaId}).story`, 120);
        assertFactsHaveSources(photo.story.facts, `photo(${photo.nasaId}).story.facts`);
      }
    }

    // Stories exist only on the curated anchor photos across all 5 chapters (CONT-04, CONT-05)
    const storyPhotos = photosDoc.photos.filter((p) => p.story !== undefined);
    expect(storyPhotos.map((p) => p.nasaId)).toEqual([
      'NHQ202604010227',
      'art002e000192',
      'art002e012090',
      'art002e012153',
      'art002e021278',
      'art002e014251',
      'art002e009301',
      'art002e009575',
      'KSC-20260410-PH-JNV01_0001',
    ]);
    const chaptersWithStories = new Set(storyPhotos.map((p) => p.chapter));
    expect([...chaptersWithStories].sort()).toEqual([...chapterIds].sort());
  });

  test('AC-3 CONT-03 date conflicts from CURATION.md and omitted unverifiable facts are surfaced explicitly', () => {
    expect(sectionsDoc.openDecisions.length).toBeGreaterThanOrEqual(5);
    expect(sectionsDoc.omittedUnverifiableFacts.length).toBeGreaterThanOrEqual(4);

    // Launch 1 and Mission 3 have unresolved capture dates kept null for Hugo's review
    const launch1 = photosDoc.photos.find((p) => p.nasaId === 'Artemis II at the pad Moon 01292026_4')!;
    expect(launch1.date).toBeNull();
    expect(launch1.dateConflict?.status).toBe('open');

    const mission3 = photosDoc.photos.find((p) => p.nasaId === 'art002e009007')!;
    expect(mission3.date).toBeNull();
    expect(mission3.dateConflict?.status).toBe('open');

    // Mission 1, 5, 17, 19, 20 document their index vs caption date conflicts
    for (const id of ['art002e000192', 'art002e024097', 'art002e016324', 'art002e010782', 'art002e009575']) {
      const entry = photosDoc.photos.find((p) => p.nasaId === id)!;
      expect(entry.dateConflict, `${id} dateConflict`).toBeDefined();
      expect(entry.dateConflict!.sources.length).toBeGreaterThanOrEqual(1);
    }
  });

  test('AC-4 LEGAL-01 LEGAL-02 no NASA endorsement claims and crater names are qualified as crew-proposed', () => {
    const rawText = readFileSync(new URL('sections.yaml', reviewDir), 'utf8') + '\n' +
      readFileSync(new URL('photos.yaml', reviewDir), 'utf8');

    // Must not claim official NASA endorsement
    expect(rawText).not.toMatch(/endorsed by NASA|official NASA website|sitio oficial de la NASA|respaldado por la NASA/i);

    // Carroll and Integrity crater entries qualify the names as proposed/suggested by the crew
    const carrollPhoto = photosDoc.photos.find((p) => p.nasaId === 'art002e012153')!;
    expect(carrollPhoto.caption.en).toMatch(/proposed/i);
    expect(carrollPhoto.caption.es).toMatch(/propuso|propuesto/i);
    expect(carrollPhoto.story!.en).toMatch(/proposed/i);
    expect(carrollPhoto.story!.es).toMatch(/propusieron|propuesto/i);

    // Mission 20 impact flash story uses the updated October 7, 2026 count of five confirmed flashes alongside the initial report of six
    const eclipseSunrise = photosDoc.photos.find((p) => p.nasaId === 'art002e009575')!;
    expect(eclipseSunrise.story!.en).toContain('five');
    expect(eclipseSunrise.story!.en).toContain('six');
    expect(eclipseSunrise.story!.es).toContain('cinco');
    expect(eclipseSunrise.story!.es).toContain('seis');
  });
});
