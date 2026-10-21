// Route table for docs/SITEMAP.md: English section/chapter IDs, localized public slugs.
export const languages = ['es', 'en'] as const;
export type Lang = (typeof languages)[number];
export const defaultLang: Lang = 'es';

export const sections = ['home', 'launch', 'mission', 'why-it-matters', 'gallery', 'about'] as const;
export type Section = (typeof sections)[number];

const sectionSlugs: Record<Section, Record<Lang, string>> = {
  home: { es: '', en: '' },
  launch: { es: 'despegue', en: 'launch' },
  mission: { es: 'mision', en: 'mission' },
  'why-it-matters': { es: 'por-que-importa', en: 'why-it-matters' },
  gallery: { es: 'galeria', en: 'gallery' },
  about: { es: 'acerca', en: 'about' },
};

export const chapterIds = ['launch', 'outbound', 'far-side', 'eclipse', 'return'] as const;
export type ChapterId = (typeof chapterIds)[number];

export const chapterSlugs: Record<ChapterId, Record<Lang, string>> = {
  launch: { es: 'despegue', en: 'launch' },
  outbound: { es: 'rumbo-a-la-luna', en: 'outbound' },
  'far-side': { es: 'lado-oculto', en: 'far-side' },
  eclipse: { es: 'eclipse', en: 'eclipse' },
  return: { es: 'regreso', en: 'return' },
};

export function sectionPath(lang: Lang, section: Section): string {
  const slug = sectionSlugs[section][lang];
  return slug ? `/${lang}/${slug}/` : `/${lang}/`;
}

export function chapterPath(lang: Lang, chapter: ChapterId): string {
  return `${sectionPath(lang, 'gallery')}${chapterSlugs[chapter][lang]}/`;
}

export function photoPath(lang: Lang, chapter: ChapterId, pathKey: string): string {
  return `${chapterPath(lang, chapter)}${pathKey}/`;
}

/** Equivalent page in the other language, for a path such as `/es/mision/`. */
export function alternatePath(path: string): string {
  const [, lang, ...rest] = path.split('/');
  if (lang !== 'es' && lang !== 'en') return path;
  const other: Lang = lang === 'es' ? 'en' : 'es';
  const segments = rest.filter(Boolean);
  const [first, second, ...tail] = segments;
  const section = sections.find((s) => sectionSlugs[s][lang] === first && first !== '');
  const out: string[] = [];
  if (section) {
    out.push(sectionSlugs[section][other]);
    if (section === 'gallery' && second) {
      const id = chapterIds.find((c) => chapterSlugs[c][lang] === second);
      out.push(id ? chapterSlugs[id][other] : second, ...tail);
    }
  }
  return `/${[other, ...out].join('/')}/`.replace('//', '/');
}
