# Puesta en marcha (Hugo, una sola vez)

Con esto el proyecto queda listo para avanzar solo, etapa por etapa, con tu aprobación en cada una.

## Cómo funciona

```
Routine arranca una etapa ─► el agente trabaja en la nube ─► abre un PR
        ▲                                                     │
        │                                     revisas la vista previa de Cloudflare
        │                                                     │
        └──── fusionas el PR (tu aprobación) ◄────────────────┘
                     │
                     └─► Cloudflare despliega main a producción
```

- **Aprobar** = fusionar el PR.
- **Pedir cambios** = comentar en el PR. Con Auto-fix activo, el agente los atiende en la misma rama.
- **Pausar el proyecto** = apagar la routine con su interruptor.

## 1. GitHub

1. Crea un repo privado, por ejemplo `HugoVP/artemis-ii`.
2. Sube todos los archivos de esta carpeta a `main` (incluida `.github/`).
3. Instala la Claude GitHub App en el repo: https://github.com/apps/claude
4. En **Settings → Rules → Rulesets**, crea una regla para `main`:
   - Exigir pull request antes de fusionar.
   - Exigir que pase el check `CI / build`.
   - Bloquear force push y borrado.

## 2. Cloudflare

1. Crea la cuenta en https://dash.cloudflare.com
2. **R2:** crea un bucket (por ejemplo, `artemis-ii-media`) y actívale acceso público con un subdominio `r2.dev` o, mejor, un dominio propio después.
3. **Token de R2:** en R2 → Manage API tokens, crea un token con permiso de lectura y escritura **solo en ese bucket**. Guarda el Access Key ID y el Secret.
4. **Pages:** Workers & Pages → Create → Pages → Connect to Git → elige el repo.
   - Framework preset: Astro
   - Build command: `npm run build`
   - Output directory: `dist`
   - Variables de entorno: `MEDIA_BASE_URL` y `CONTACT_URL`
   - Con esto, cada PR tiene su URL de vista previa y cada fusión a `main` despliega producción.

   El primer build fallará hasta que exista el proyecto (Etapa 01). Es normal.

## 3. Entorno en la nube de Claude Code

En claude.ai/code, crea un entorno llamado `artemis-ii`:

- **Network access:** Custom, con "Also include default list of common package managers" activado, y estos dominios:
  - `eol.jsc.nasa.gov`
  - `pds-imaging.jpl.nasa.gov`
  - `www.nasa.gov`
  - `images.nasa.gov`
  - `images-api.nasa.gov`
  - `images-assets.nasa.gov`
  - `<TU_ACCOUNT_ID>.r2.cloudflarestorage.com`

  Si una etapa se bloquea por un dominio, el agente lo dirá en el PR y lo agregas aquí.
- **Environment variables:** `MEDIA_BASE_URL`, `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`, `CONTACT_URL`.
- **Setup script:**
  ```
  if [ -f package.json ]; then npm ci; fi
  ```

## 4. La routine

Créala en claude.ai/code/routines con la configuración y el prompt de `docs/ROUTINE.md`.

## 5. Arrancar

1. En la routine, pulsa **Run now**. Esto lanza la Etapa 00 (el plan).
2. Cuando llegue el PR, actívale **Auto-fix** desde la sesión.
3. Revisa el plan, comenta si quieres cambios y fusiona cuando te guste.
4. Desde ahí, cada fusión arranca la siguiente etapa sola.

## Para tener en cuenta

- Las routines están en vista previa y consumen tu límite de uso, igual que una sesión normal.
- Un estado verde en la lista de corridas solo significa que no hubo error de infraestructura. Lo que cuenta es el PR y su vista previa.
- Todo lo que hacen los agentes en GitHub aparece con tu usuario.
- Las variables del entorno las puede ver cualquiera que use ese entorno. Mantén el entorno solo para este proyecto.
