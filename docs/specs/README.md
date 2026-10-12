# Specs: how this project uses spec-driven development

Every piece of the site is described in a spec before it is built. Specs are the contract between Hugo (who approves) and the agents (who build). Code that is not backed by a spec does not get merged.

## Spec layers

| Layer | File | Answers | Changes when |
| --- | --- | --- | --- |
| Brief | `PROMPT.md` | What Hugo wants, in his words | Hugo changes his mind |
| Product spec | `docs/specs/product.md` | What the finished site must do, as numbered, testable requirements | A requirement is added, removed or reworded (always in a PR, called out) |
| Design spec | `docs/specs/design.md` + the Figma file | What the site looks like: tokens, components, screens | Stage 01, or a later stage that needs a design change |
| Stage spec | `docs/specs/stage-NN-short-name.md` | What one stage delivers, and how we know it is done | Written one stage ahead; amended during its own stage if needed |

If two layers disagree, the more specific approved one wins (stage spec > design spec > product spec > brief), and the agent must point out the conflict in the PR.

## Requirement IDs

Requirements in `product.md` have stable IDs such as `I18N-03` or `GAL-07`. IDs are never reused or renumbered; a removed requirement is marked `(removed)`. Stage specs, acceptance criteria, tests and PRs refer to requirements by ID, so every requirement can be traced to the stage that delivers it and the test that checks it.

## The look-ahead cycle

Each stage PR carries two things:

1. **The work of stage N**, built against the already-approved `stage-NN` spec.
2. **The spec for stage N+1**, written at the end of stage N.

So when Hugo merges a PR he approves the result of stage N *and* the plan for stage N+1. The next agent starts from an approved spec and never has to guess. This keeps one PR per stage while still writing the spec before the code.

If an agent finds during stage N that its own spec is wrong or incomplete, it amends the spec in the same PR and lists the change under "Spec changes" in the PR body. It never silently builds something different from the spec.

## What a stage spec contains

Use [`_template.md`](_template.md). In short:

- **Goal** and **requirements covered** (IDs from `product.md`).
- **Scope** and **out of scope**.
- **Design references** (Figma frames) for any visible change.
- **Acceptance criteria**: numbered, observable, each one either automated (Playwright test, build check, script) or manual (a concrete thing Hugo looks at in the preview). These become the "What to review" checklist of the PR.
- **Tasks**: the ordered steps the agent will follow.
- **Risks and open questions**: anything that could block the stage (missing variable, blocked domain, decision Hugo must take).

## Verification

From Stage 02 on, acceptance criteria that can be automated are written as Playwright tests against the static build (`npm run test`), and CI runs them on every PR. Manual criteria are listed in the PR as a checklist for Hugo. Stage 10 (final review) checks the traceability table in `product.md`: every requirement must be delivered by a stage and verified by a test or a manual check.
