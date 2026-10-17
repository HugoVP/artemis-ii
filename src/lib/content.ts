import { getCollection } from 'astro:content';
import { chapterIds } from '../i18n/routes';

/** Loads all collections and fails the build if a source reference points nowhere. */
export async function loadContent() {
  const [chapters, photos, stories, sources] = await Promise.all([
    getCollection('chapters'),
    getCollection('photos'),
    getCollection('stories'),
    getCollection('sources'),
  ]);
  const known = new Set(sources.map((s) => s.id));
  for (const entry of [...photos, ...stories]) {
    for (const id of entry.data.sourceIds) {
      if (!known.has(id)) throw new Error(`${entry.collection}/${entry.id}: unknown source "${id}"`);
    }
  }
  const missing = chapterIds.filter((id) => !chapters.some((c) => c.id === id));
  if (missing.length) throw new Error(`Missing chapters: ${missing.join(', ')}`);
  return {
    chapters: [...chapters].sort((a, b) => a.data.order - b.data.order),
    photos,
    stories,
    sources,
  };
}
