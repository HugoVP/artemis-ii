import { chapterIds, chapterSlugs, sections, sectionPath, type ChapterId, type Lang, type Section } from '../i18n/routes';
import { loadContent } from './content';

export type RouteProps =
  | { kind: 'section'; section: Section }
  | { kind: 'chapter'; chapter: ChapterId }
  | { kind: 'photo'; chapter: ChapterId; photoId: string };

/** Every page of one language, as `[...path]` params (undefined for the home page) plus page props. */
export async function getRoutes(lang: Lang): Promise<{ path: string | undefined; props: RouteProps }[]> {
  const { photos } = await loadContent();
  const rel = (full: string) => full.replace(`/${lang}/`, '').replace(/\/$/, '') || undefined;
  return [
    ...sections.map((section) => ({ path: rel(sectionPath(lang, section)), props: { kind: 'section', section } as RouteProps })),
    ...chapterIds.map((chapter) => ({
      path: `${rel(sectionPath(lang, 'gallery'))}/${chapterSlugs[chapter][lang]}`,
      props: { kind: 'chapter', chapter } as RouteProps,
    })),
    ...photos.map((p) => ({
      path: `${rel(sectionPath(lang, 'gallery'))}/${chapterSlugs[p.data.chapter][lang]}/${p.data.pathKey}`,
      props: { kind: 'photo', chapter: p.data.chapter, photoId: p.data.pathKey } as RouteProps,
    })),
  ];
}
