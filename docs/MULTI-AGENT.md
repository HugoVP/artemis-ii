# Multi-agent environment (plan)

How the project moves from "one agent per stage, started by hand" to a team of agents that builds an iteration with Hugo reviewing once at the end. This is a plan, not a spec of a stage: nothing here is built until a PR for the phase is approved. If this file disagrees with `AGENTS.md`, `AGENTS.md` wins.

## Goals

- Any agent from any provider can lead a stage, and agents from other providers review it.
- The environment is the same for all of them (the Docker images of `docs/DOCKER.md`).
- Hugo approves an iteration plan at the start and accepts the result at the end. Everything in between is automatic, and he is called only when an escalation rule fires.
- The mechanism is generic: it does not depend on this site, so it can build other systems.

## Principles

- **The repo is the contract.** Specs, rules and status live in the repository. Agents and tools read them; they do not hold them.
- **A script decides, agents propose.** Who leads and who reviews is chosen by a deterministic script from a registry file, so a run can be repeated and audited. Agents may propose a short plan, but they do not vote.
- **Secrets stay in the pipeline.** Model API keys live in a GitHub environment restricted to `main`. The agent's job gets no deployment or storage credentials (`docs/DELIVERY.md`).
- **No agent merges into `main`.** Only Hugo does. Phase 3 may let the pipeline merge stage branches into an iteration branch, which needs an amendment of `AGENTS.md` approved by Hugo.
- **Verify facts, not just code.** Content needs a source for every fact, checked by a script and by a reviewer from another provider.

## Phases

The detailed design of phases 2 to 4 (jobs, permissions, acceptance criteria, rollback) is in [`MULTI-AGENT-PHASES.md`](MULTI-AGENT-PHASES.md).

| Phase | What it delivers | Where it runs | Status |
| --- | --- | --- | --- |
| 1 | Docker images and dev container (`Dockerfile`, `compose.yaml`) | Local, Codespaces | PR open |
| 2 | Agent runner image and one workflow that runs one agent on one work order | GitHub Actions | This plan |
| 3 | Agent registry, orchestrator script, reviewers, `iteration/N` branch | GitHub Actions | Later |
| 4 | Own server for long or heavy runs | A small VPS | Only if needed |

### Phase 2: runner image and workflow

- **Image `agent-runner`:** a new target in the `Dockerfile` based on `tools`, with the command-line agents installed at pinned versions. Each agent is added only after Hugo has set it up and its first test run is recorded in `docs/agents/other-agents.md`.
- **Workflow `agent-run.yml`:** started by hand (`workflow_dispatch`) with inputs `agent` and `stage`, and later by the label that Hugo puts on a `Run Stage NN` issue. It checks out the default branch, runs the agent in the runner image on a new branch, and then a separate job with no project code checks the result and opens the PR with a GitHub App token. The agent itself never holds a GitHub write token.
- **Permissions:** the `work` job has no GitHub write token. Only the `publish` job writes, through a GitHub App installation token. That token is scoped to the repository, not to one branch (GitHub cannot limit it further), so the branch boundary is enforced by `publish`, which pushes only to `agent/stage-NN-*` and checks the destination before pushing. Verifying that boundary is a Phase 2 prerequisite. The App cannot change workflows, settings or secrets, and it cannot push to `main`, because the `main` ruleset has no bypass.
- **Secrets:** one API key per agent, in an environment called `agents`, restricted to `main`, and exposed only to the step that starts that agent.
- **Triggers:** only Hugo can start a run. Comments or issues from other people never start an agent, and their text is treated as untrusted data.
- **Limits:** a time limit per run, one run at a time per stage, and a log of what each run did. Cost limits are set in each provider's own console.

### Phase 3: team and iterations

- **Registry** (`agents/registry.yaml`): for each agent, the capabilities of `docs/agents/README.md`, the provider, how to start it, its cost class and its quota notes.
- **Orchestrator** (`scripts/`): reads `docs/PLAN.md` and the registry and picks, per stage, one leader and two reviewers from other providers. The score uses required capabilities first, then past results (green CI on the first try, findings in review), then cost and quota, then rotation: the previous leader is excluded from the next stage, and if nobody else is eligible the run escalates to Hugo.
- **Stage branches** (`stage/NN-*`) are merged into `iteration/N` by the pipeline when CI, security checks, source checks and the reviewers' verdict pass. Today's approvals and progression rules (`docs/specs/README.md`, `docs/PLAN.md`) and CI, which runs only on PRs to `main`, do not allow this. Phase 3 therefore starts with approved amendments of those rules and a CI trigger for `iteration/**`; until then every current gate stays as it is.
- **Hugo's two gates:** the iteration plan (which stages or improvements enter) and the acceptance of `iteration/N` into `main`, reviewed once in a preview.
- **Escalation to Hugo:** a check fails twice, a security finding, a fact that cannot be verified, a change to the approved design, or an exhausted budget.

## Decisions needed from Hugo

0. A narrow exception in `AGENTS.md` and `docs/DELIVERY.md` that lets model API keys reach the agent's job (Phase 2 prerequisite). Deployment and storage credentials stay forbidden.
1. Which agents are registered first and which of them have an API key (free or paid). Phase 2 adds one at a time.
2. Whether the pipeline may merge stage branches into `iteration/N` (an `AGENTS.md` amendment, in Phase 3).
3. The monthly budget per provider, set in each provider's console.

## To verify before building

- The free minutes that GitHub Actions gives this repository, and the time limit per job, on the live GitHub pages.
- For each agent: its headless (non-interactive) mode, how it authenticates in CI, and whether the Figma connector is available there.
- That the runner image builds on a GitHub-hosted runner, which has the network access that the Phase 1 sandbox lacked.
