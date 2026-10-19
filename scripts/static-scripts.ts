import type { AstroIntegration } from 'astro';
import { stripTypeScriptTypes } from 'node:module';
import { readFile, writeFile, readdir, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';

/** Keep the pre-paint script and Astro's island bootstrap compatible with script-src 'self'. */
export function staticScripts(): AstroIntegration {
  const source = new URL('../src/scripts/preferences-head.ts', import.meta.url);
  const compile = async () => stripTypeScriptTypes(await readFile(source, 'utf8'));
  return {
    name: 'static-preference-scripts',
    hooks: {
      'astro:server:setup': ({ server }) => {
        server.middlewares.use('/preferences.js', async (_req, res) => {
          res.setHeader('Content-Type', 'text/javascript');
          res.end(await compile());
        });
      },
      'astro:build:done': async ({ dir }) => {
        await writeFile(new URL('preferences.js', dir), await compile());
        const assets = new URL('_astro/', dir);
        await mkdir(assets, { recursive: true });
        async function visit(folder: URL): Promise<void> {
          for (const entry of await readdir(folder, { withFileTypes: true })) {
            const url = new URL(entry.name + (entry.isDirectory() ? '/' : ''), folder);
            if (entry.isDirectory()) await visit(url);
            else if (entry.name.endsWith('.html')) {
              const html = await readFile(url, 'utf8');
              const scripts = [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g)];
              let output = html;
              for (const [tag, attributes, code] of scripts) {
                if (/\bsrc\s*=/.test(attributes) || !code.trim() || /\btype=["'](?!module["']|text\/javascript["'])/.test(attributes)) continue;
                const name = `runtime-${createHash('sha256').update(code).digest('hex').slice(0, 16)}.js`;
                await writeFile(new URL(name, assets), code);
                output = output.replace(tag, `<script${attributes} src="/_astro/${name}"></script>`);
              }
              await writeFile(url, output);
            }
          }
        }
        await visit(dir);
      },
    },
  };
}
