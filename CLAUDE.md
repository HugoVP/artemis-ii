# CLAUDE.md — Sitio bilingüe Artemis II

Lee este archivo completo antes de hacer cualquier cosa. Después lee `PROMPT.md` (qué se construye) y `docs/PLAN.md` (en qué etapa vamos).

## El flujo de trabajo

Este proyecto lo construyen agentes en la nube, una etapa a la vez. El dueño del proyecto (Hugo) aprueba cada etapa fusionando su pull request. Esa fusión hace dos cosas solas:

1. Cloudflare Pages despliega `main` a producción.
2. Una routine de Claude Code arranca la siguiente etapa.

Por eso cada etapa debe terminar en un PR que se pueda fusionar tal cual, sin pasos manuales escondidos.

## Reglas de cada etapa

1. **Una etapa por sesión y por PR.** Toma solo la siguiente etapa pendiente de `docs/PLAN.md`. No adelantes trabajo de etapas futuras.
2. **Nunca hagas push a `main`.** Trabaja en una rama `claude/etapa-NN-nombre-corto` y abre un PR contra `main`.
3. **Si ya hay un PR de etapa abierto, no empieces otra.** Termina sin cambios y explica por qué en el resumen de la sesión.
4. **Antes de abrir el PR:**
   - Corre `npm run build` (y `npm run check` cuando exista) y asegúrate de que pasen.
   - Actualiza `docs/PLAN.md`: marca la etapa como `en revisión`, enlaza el PR y anota lo que quedó pendiente o cambió.
5. **Formato del PR**, en español:
   - Título: `Etapa NN: <nombre>`.
   - Qué se hizo, en viñetas cortas.
   - Qué revisar: la lista concreta de cosas que Hugo debe ver en la vista previa de Cloudflare (páginas y qué buscar en cada una).
   - Decisiones tomadas y por qué.
   - Fuentes consultadas, si la etapa incluye datos o textos.
   - Pendientes o riesgos.
6. **Etapas de revisión de contenido** (marcadas con 🔍 en el plan): el PR contiene solo el contenido a revisar (listas, textos, fuentes), sin integrarlo todavía al sitio. Hugo lo aprueba fusionando o pide cambios en comentarios.
7. **Si Hugo deja comentarios en un PR**, atiéndelos en la misma rama. No abras otro PR para lo mismo.
8. **Si te bloqueas** (falta una credencial, un dominio bloqueado por la red, una decisión que no está en el prompt), no improvises: abre el PR como borrador con lo que sí lograste y explica exactamente qué necesitas de Hugo.

## Reglas de contenido

- Todo dato (fechas, horas, distancias, récords, primeras veces, nombres) se verifica en fuentes oficiales o periodísticas confiables. Guarda el enlace de cada fuente junto al dato en las content collections. No escribas datos de memoria.
- Si algo no se puede verificar, déjalo fuera y anótalo en el PR.
- Español e inglés escritos de forma natural, nunca traducción literal.
- Historias sensibles (por ejemplo, el cráter Carroll) con respeto y sin dramatizar.
- Créditos: "Crédito: NASA" / "Credit: NASA" con enlace al original. Sin logotipos ni insignias de NASA, sin sugerir respaldo de NASA, sin publicidad.

## Reglas técnicas

- Astro + TypeScript + Tailwind, sitio 100% estático. React solo para islas interactivas.
- Gestor de paquetes: npm, con `package-lock.json` en el repo. Scripts `build` y `check` en `package.json` (la CI los usa).
- Content collections con esquema Zod para fotos, historias, capítulos y fuentes.
- Medios desde almacenamiento propio vía `MEDIA_BASE_URL`. Nunca enlaces directo a imágenes en servidores de NASA (solo enlaces de "ver original").
- Imágenes y binarios pesados fuera del repo: van a R2. En el repo solo quedan los metadatos y, si acaso, miniaturas muy ligeras.
- Secretos solo en variables de entorno. Nunca escribas llaves, tokens ni endpoints privados en archivos del repo, en commits ni en PRs.
- `localStorage` siempre dentro de try/catch.
- Accesibilidad: contraste suficiente en ambos temas, foco visible, textos alternativos en ambos idiomas.
- Móvil primero.

## Variables de entorno esperadas

| Variable | Uso |
| --- | --- |
| `MEDIA_BASE_URL` | URL pública de los medios en R2 |
| `R2_ACCOUNT_ID` | Cuenta de Cloudflare para subir a R2 |
| `R2_ACCESS_KEY_ID` | Llave de acceso de R2 (solo el bucket del proyecto) |
| `R2_SECRET_ACCESS_KEY` | Secreto de R2 |
| `R2_BUCKET` | Nombre del bucket |
| `CONTACT_URL` | Enlace o correo para el aviso de IA |

Si una etapa necesita una variable que no está definida, deténte y pídela en el PR (regla 8).
