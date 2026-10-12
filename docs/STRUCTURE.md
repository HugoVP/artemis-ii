# Estructura del proyecto (propuesta)

```
artemis-ii/
├── CLAUDE.md  PROMPT.md  CURATION.md (Etapa 03)
├── astro.config.mjs  tailwind.config.*  tsconfig.json
├── package.json  package-lock.json
├── .github/workflows/ci.yml
├── docs/                      PLAN, SETUP, ROUTINE, STRUCTURE, SITEMAP
│   └── content-review/        borradores de textos (Etapa 06)
├── scripts/
│   └── ingest.ts              descarga + sharp + subida a R2 (Etapa 04)
├── public/                    solo favicon y miniaturas muy ligeras
└── src/
    ├── content/
    │   ├── config.ts          esquemas Zod
    │   ├── photos/            un archivo por foto (metadatos, ES/EN)
    │   ├── stories/           historias de fotos (ES/EN, con fuentes)
    │   ├── chapters/          capítulos de la misión
    │   └── sources/           fuentes con título, URL y fecha de consulta
    ├── i18n/                  textos de interfaz es/en y utilidades de rutas
    ├── lib/                   media.ts (MEDIA_BASE_URL), fechas, helpers
    ├── layouts/               Base.astro
    ├── components/            .astro estáticos; islas React en components/islands/
    ├── styles/                global.css, variables de tema y densidad
    └── pages/
        ├── index.astro        redirige a /es/
        ├── es/  …             páginas en español
        └── en/  …             páginas en inglés
```

## Decisiones

- **Rutas por carpeta de idioma** (`pages/es`, `pages/en`) con español por defecto; los slugs son iguales en ambos idiomas para poder cambiar de idioma a la misma página, salvo los nombres de sección (ver `SITEMAP.md`).
- **Esquemas Zod bilingües:** cada campo de texto es `{ es, en }`; las fuentes se enlazan por ID desde fotos e historias, y cada dato lleva `sourceIds`.
- **Medios fuera del repo:** `MEDIA_BASE_URL` apunta a R2 (producción) o a una carpeta local ignorada por git (desarrollo). Ruta: `<MEDIA_BASE_URL>/<id-nasa>/{original.ext, 640.avif, 1280.webp, thumb.webp, og.jpg…}`.
- **Islas React** solo para preferencias y, si hace falta, el visor de galería.
- **Sin secretos en el repo;** `.env.example` solo con nombres de variables.
