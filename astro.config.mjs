import { defineConfig } from 'astro/config';
import react from '@astrojs/react';
import sitemap from '@astrojs/sitemap';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  // Per-environment value set by the pipeline (Stage 03); the placeholder keeps local builds working.
  site: process.env.SITE_URL ?? 'http://localhost:4321',
  output: 'static',
  trailingSlash: 'always',
  integrations: [react(), sitemap()],
  vite: { plugins: [tailwindcss()] },
});
