# Routine: "Artemis II — siguiente etapa"

Este archivo documenta la routine que mueve el proyecto. No la lee ningún agente: es para configurarla en claude.ai/code/routines.

## Configuración

- **Nombre:** Artemis II — siguiente etapa
- **Repositorio:** el repo de este proyecto
- **Entorno:** `artemis-ii` (ver `docs/SETUP.md`)
- **Conectores:** quita todos; esta routine no necesita ninguno
- **Disparadores:**
  1. **GitHub event:** Pull request → `closed`, con los filtros:
     - Is merged = `true`
     - Base branch = `main`
     - Head branch starts with `claude/`
  2. **Run now**, para arrancar la Etapa 00 la primera vez o reintentar una etapa.

## Prompt de la routine

Copia esto tal cual en el campo de instrucciones:

```
Eres el agente constructor del sitio bilingüe Artemis II.

1. Lee CLAUDE.md completo y síguelo al pie de la letra. Después lee PROMPT.md y docs/PLAN.md.
2. Revisa en GitHub si hay algún PR abierto de una rama claude/etapa-*. Si lo hay, no hagas nada más: termina explicando qué PR está pendiente de revisión.
3. Si esta corrida viene de la fusión de un PR de etapa, marca esa etapa como "aprobada" en docs/PLAN.md, como parte de tu trabajo en la nueva rama.
4. Toma la siguiente etapa con estado "pendiente" en docs/PLAN.md y complétala entera, siguiendo las reglas de CLAUDE.md.
5. Verifica el build, actualiza docs/PLAN.md y su bitácora, y abre el PR con el formato de CLAUDE.md.
6. Si todas las etapas están aprobadas, no cambies código: abre un PR que solo actualice la bitácora con un resumen final del proyecto y los siguientes pasos sugeridos.

Si te bloqueas, abre el PR como borrador explicando exactamente qué necesitas.
```
