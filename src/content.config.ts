import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { chapterSchema, photoSchema, sourceSchema, storySchema } from './content/schemas';

const load = (base: string) => glob({ pattern: '**/*.json', base: `./src/content/${base}` });

export const collections = {
  chapters: defineCollection({ loader: load('chapters'), schema: chapterSchema }),
  photos: defineCollection({ loader: load('photos'), schema: photoSchema }),
  stories: defineCollection({ loader: load('stories'), schema: storySchema }),
  sources: defineCollection({ loader: load('sources'), schema: sourceSchema }),
};
