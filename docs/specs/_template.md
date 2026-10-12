# Stage NN: <name>

- **Status:** draft | approved (merged with the previous stage's PR) | amended in stage NN
- **Requirements covered:** `XXX-01`, `XXX-02`
- **Depends on:** stage NN (what it must provide)

## Goal

One or two sentences: what changes for a visitor (or for Hugo) when this stage is done.

## Scope

- What this stage builds.

## Out of scope

- What it deliberately does not build, and which stage does.

## Design references

- Figma frame links for every screen or component this stage touches. "None" if the stage has no visible change.

## Acceptance criteria

| # | Criterion | Requirement | Check |
| --- | --- | --- | --- |
| AC-1 | Observable statement of done. | `XXX-01` | automated: `tests/…spec.ts` |
| AC-2 | Something Hugo looks at in the preview, and what he should see. | `XXX-02` | manual: page and what to look for |

## Tasks

1. Ordered steps the agent will follow.

## Risks and open questions

- Missing variables, blocked domains, decisions Hugo must take. If one of these blocks the stage, the PR is opened as a draft (CLAUDE.md, rule 8).
