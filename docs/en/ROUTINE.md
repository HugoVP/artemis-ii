# Routine: "Artemis II — next stage" (English translation)

> Translation of `docs/ROUTINE.md` (Spanish), which is the source of truth. Update both together.

This file documents the routine that moves the project forward. No agent reads it: it is for configuring the routine at claude.ai/code/routines.

## Configuration

- **Name:** Artemis II — siguiente etapa
- **Repository:** this project's repo
- **Environment:** `artemis-ii` (see `docs/SETUP.md`)
- **Connectors:** remove all of them; this routine needs none
- **Triggers:**
  1. **GitHub event:** Pull request → `closed`, with the filters:
     - Is merged = `true`
     - Base branch = `main`
     - Head branch starts with `claude/`
  2. **Run now**, to start Stage 00 the first time or to retry a stage.

## Routine prompt

Copy this as is into the instructions field (the prompt stays in Spanish, since agents work in Spanish; an English rendering follows):

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

English rendering (for reference only):

```
You are the builder agent for the bilingual Artemis II site.

1. Read CLAUDE.md in full and follow it to the letter. Then read PROMPT.md and docs/PLAN.md.
2. Check on GitHub whether there is any open PR from a claude/etapa-* branch. If there is, do nothing else: finish by explaining which PR is pending review.
3. If this run comes from the merge of a stage PR, mark that stage as "aprobada" (approved) in docs/PLAN.md, as part of your work on the new branch.
4. Take the next stage with status "pendiente" (pending) in docs/PLAN.md and complete it entirely, following the rules in CLAUDE.md.
5. Verify the build, update docs/PLAN.md and its log, and open the PR in the CLAUDE.md format.
6. If all stages are approved, do not change code: open a PR that only updates the log with a final project summary and suggested next steps.

If you get blocked, open the PR as a draft explaining exactly what you need.
```
