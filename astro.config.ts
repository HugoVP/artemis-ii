import { defineConfig } from 'astro/config';
import react from '@astrojs/react';
import sitemap from '@astrojs/sitemap';
import tailwindcss from '@tailwindcss/vite';
import { loadEnv } from 'vite';
import { staticScripts } from './scripts/static-scripts.ts';

// `.env` files are not in `process.env` when this file runs; exported variables still take precedence.
const env = loadEnv(process.env.NODE_ENV ?? 'production', process.cwd(), '');

export default defineConfig({
  // Per-environment value set by the pipeline (Stage 03); the placeholder keeps local builds working.
  site: env.SITE_URL || 'http://localhost:4321',
  output: 'static',
  trailingSlash: 'always',
  integrations: [react(), sitemap(), staticScripts()],
  vite: { plugins: [tailwindcss()] },
});
