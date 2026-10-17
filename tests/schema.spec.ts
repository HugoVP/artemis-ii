import { test, expect } from '@playwright/test';
import { chapterSchema, photoSchema, sourceSchema, storySchema } from '../src/content/schemas';

const valid = {
  photo: {
    nasaId: 'x-1',
    chapter: 'launch',
    title: { es: 't', en: 't' },
    alt: { es: 'a', en: 'a' },
    caption: { es: 'c', en: 'c' },
    originalUrl: 'https://images.nasa.gov/',
    hash: 'deadbeef',
    sourceIds: ['s1'],
  },
  story: { photoId: 'x-1', text: { es: 't', en: 't' }, sourceIds: ['s1'] },
  chapter: { order: 1, title: { es: 't', en: 't' }, summary: { es: 's', en: 's' } },
  source: { title: 'NASA', url: 'https://www.nasa.gov/', accessed: '2026-10-16' },
};

test.describe('AC-5 content collections reject incomplete entries (TECH-02)', () => {
  test('AC-5 valid entries pass', () => {
    expect(photoSchema.safeParse(valid.photo).success).toBe(true);
    expect(storySchema.safeParse(valid.story).success).toBe(true);
    expect(chapterSchema.safeParse(valid.chapter).success).toBe(true);
    expect(sourceSchema.safeParse(valid.source).success).toBe(true);
  });

  test('AC-5 photos and stories without sources are rejected', () => {
    expect(photoSchema.safeParse({ ...valid.photo, sourceIds: [] }).success).toBe(false);
    expect(storySchema.safeParse({ ...valid.story, sourceIds: [] }).success).toBe(false);
    const { sourceIds: _p, ...photo } = valid.photo;
    const { sourceIds: _s, ...story } = valid.story;
    expect(photoSchema.safeParse(photo).success).toBe(false);
    expect(storySchema.safeParse(story).success).toBe(false);
  });

  test('AC-5 text missing a language is rejected', () => {
    expect(photoSchema.safeParse({ ...valid.photo, alt: { es: 'solo es' } }).success).toBe(false);
    expect(chapterSchema.safeParse({ ...valid.chapter, title: { es: '', en: 't' } }).success).toBe(false);
  });

  test('AC-5 missing required fields and bad values are rejected', () => {
    const { nasaId: _n, ...noId } = valid.photo;
    expect(photoSchema.safeParse(noId).success).toBe(false);
    expect(photoSchema.safeParse({ ...valid.photo, chapter: 'moon' }).success).toBe(false);
    expect(photoSchema.safeParse({ ...valid.photo, originalUrl: 'not a url' }).success).toBe(false);
    expect(sourceSchema.safeParse({ ...valid.source, accessed: 'yesterday' }).success).toBe(false);
  });
});
