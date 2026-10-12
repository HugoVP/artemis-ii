# Plan de etapas

Este archivo lo mantienen los agentes. Cada etapa termina en un PR, y Hugo la aprueba fusionándolo.

Estados posibles: `pendiente`, `en revisión` (PR abierto), `aprobada` (PR fusionado).
🔍 = etapa de revisión de contenido: el PR trae solo el contenido para aprobar, sin integrarlo al sitio.

La estructura del proyecto está en [`STRUCTURE.md`](STRUCTURE.md) y el mapa del sitio en [`SITEMAP.md`](SITEMAP.md).

| # | Etapa | Estado | PR |
| --- | --- | --- | --- |
| 00 | 🔍 Plan detallado, estructura del proyecto y mapa del sitio | en revisión | (ver bitácora) |
| 01 | Base del proyecto: Astro, Tailwind, rutas es/en, layout, CI | pendiente | |
| 02 | Preferencias: tema, idioma, densidad del sitio y vista de galería | pendiente | |
| 03 | 🔍 Curación: fotos candidatas con IDs en `CURATION.md` (sin descargar) | pendiente | |
| 04 | Ingesta: script de descarga, variantes con sharp y subida a R2 | pendiente | |
| 05 | Galería: capítulos, vistas Mosaico/Galería/Inmersiva y página por foto | pendiente | |
| 06 | 🔍 Textos: El despegue, La misión y Por qué importa, en ambos idiomas, con fuentes | pendiente | |
| 07 | Secciones: Inicio, El despegue (con video), La misión (línea de tiempo) y Por qué importa | pendiente | |
| 08 | Acerca de, aviso de IA, créditos, Open Graph y hreflang | pendiente | |
| 09 | Revisión final: accesibilidad, rendimiento móvil y enlaces rotos | pendiente | |

La Etapa 00 conserva el orden y la división sugeridos. Ajustes decididos:

- Los tres puntos de revisión obligatorios de `PROMPT.md` quedan cubiertos por las etapas 00, 03 y 06.
- Las etapas 05 y 07 se pueden construir con datos de prueba mínimos si sus etapas de contenido (03/06) aún no se fusionan, pero no integran contenido sin aprobar. El orden actual evita ese caso: 05 va después de 04, y 07 después de 06.
- La Etapa 08 incluye el pie de página con el aviso corto de IA; el layout de la Etapa 01 deja el espacio reservado.

## Detalle por etapa

### 00 🔍 Plan, estructura y mapa del sitio
- **Entrega:** este archivo, `STRUCTURE.md`, `SITEMAP.md`. Sin código.
- **Aprobación:** Hugo fusiona.

### 01 Base del proyecto
- Astro + TypeScript estricto + Tailwind; `@astrojs/react` instalado para islas; `@astrojs/sitemap`.
- `package.json` con scripts `dev`, `build`, `check` (`astro check`), `package-lock.json`.
- Rutas `src/pages/es/*` y `src/pages/en/*`; `/` redirige a `/es/` (la detección de idioma del navegador llega en la Etapa 02).
- Layout base, barra superior y pie de página (con espacio para el aviso de IA), diccionario de textos de interfaz (`src/i18n/`).
- Content collections con esquema Zod: `photos`, `stories`, `chapters`, `sources` (con datos mínimos de ejemplo, sin contenido real).
- `src/lib/media.ts`: construye URLs a partir de `MEDIA_BASE_URL`.
- Páginas de cada sección como cascarones sin texto final.
- **Revisar:** `/es/` y `/en/` cargan, navegación entre secciones, vista móvil.

### 02 Preferencias
- Isla React en la barra superior: tema (claro/oscuro/sistema, oscuro por defecto), idioma, densidad (compacta/cómoda/amplia) y, solo en galerías, vista (mosaico/galería/inmersiva).
- Script en línea en `<head>` que aplica tema y densidad antes de pintar (sin parpadeo). `localStorage` siempre en try/catch.
- Densidad por variables CSS (espaciado, tamaño de texto, ancho de contenido). Detección de idioma del navegador solo en la primera visita.
- El selector de idioma lleva a la misma página en el otro idioma.
- **Revisar:** cada combinación de preferencias, persistencia al recargar, foco visible y contraste en ambos temas.

### 03 🔍 Curación
- `CURATION.md` con 20–30 fotos de la misión y 5–8 del despegue: ID de NASA, enlace al original, capítulo, justificación, licencia/derechos verificados, y notas de historias candidatas. Sin descargar imágenes.
- Fuentes: Gateway to Astronaut Photography, PDS, galerías oficiales de NASA.
- **Posible bloqueo:** dominios de NASA bloqueados por la red del entorno; se reporta en el PR.

### 04 Ingesta
- `scripts/ingest.ts`: lee la lista aprobada, descarga originales, genera AVIF/WebP en varios anchos, miniatura y Open Graph 1200×630, guarda por ID de NASA, idempotente.
- Destino local (desarrollo) o R2 (producción) según variables de entorno; sin secretos en el repo.
- Metadatos de las fotos pasan a `src/content/photos/`.
- **Posible bloqueo:** variables `R2_*` y `MEDIA_BASE_URL` no definidas, o dominios sin acceso.

### 05 Galería
- Capítulos: el despegue, rumbo a la Luna, el lado oculto, el eclipse, el regreso.
- Tres vistas (mosaico, galería, inmersiva) independientes de la densidad, página por foto (imagen, historia o pie, fecha, cámara, ID NASA, enlace al original, descarga desde almacenamiento propio, crédito).
- Open Graph por foto.

### 06 🔍 Textos
- Borradores ES/EN de El despegue, La misión y Por qué importa, más historias de fotos, cada dato con su enlace de fuente. Lo no verificable se deja fuera y se anota.
- Van en `docs/content-review/` sin integrarse al sitio.

### 07 Secciones
- Inicio, El despegue (reproductor ligero que no carga nada de terceros hasta el clic), La misión (línea de tiempo, tripulación, hitos y récords) y Por qué importa, con los textos aprobados.

### 08 Acerca de, IA, créditos, OG y hreflang
- Aviso de IA corto en el pie y completo en Acerca de (ES/EN), `CONTACT_URL`, pautas de uso de NASA, créditos, hreflang y Open Graph por idioma.

### 09 Revisión final
- Accesibilidad (contraste, foco, alt en ambos idiomas), rendimiento móvil, enlaces rotos, build en ambos idiomas con las 3 densidades y las 3 vistas.

## Bitácora

Cada etapa agrega aquí una línea al abrir su PR: fecha, etapa, enlace al PR y una frase de lo que hizo.

- 2026-10-12 — Etapa 00 — PR: ver el PR de la rama `claude/quirky-sagan-r8903l` — Plan detallado, estructura del proyecto y mapa del sitio.
