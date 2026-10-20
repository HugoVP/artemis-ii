import { z } from 'astro/zod';

// Zod schemas for the content collections (TECH-02). Kept free of Astro-only imports so tests can load them.
export const bilingual = z.object({ es: z.string().min(1), en: z.string().min(1) });

const sourceIds = z.array(z.string().min(1)).min(1, 'at least one source is required');

export const chapterIds = ['launch', 'outbound', 'far-side', 'eclipse', 'return'] as const;

export const sourceSchema = z.object({
  title: z.string().min(1),
  url: z.url(),
  accessed: z.iso.date(),
});

export const chapterSchema = z.object({
  order: z.number().int().positive(),
  title: bilingual,
  summary: bilingual,
});

export const photoSchema = z.object({
  /** Exact NASA ID, byte for byte (it may contain spaces). */
  nasaId: z.string().min(1),
  /** Safe media and URL key derived from the ID (`pathKeyFor` in scripts/pages-media.ts). */
  pathKey: z.string().regex(/^[A-Za-z0-9_-]+$/),
  chapter: z.enum(chapterIds),
  title: bilingual,
  alt: bilingual,
  caption: bilingual,
  date: z.iso.date().optional(),
  camera: z.string().optional(),
  originalUrl: z.url(),
  hash: z.string().regex(/^[0-9a-f]{8,}$/, 'content hash (hex)'),
  sourceIds,
});

export const storySchema = z.object({
  photoId: z.string().min(1),
  text: bilingual,
  sourceIds,
});
