# Multi-agent environment: phases in detail

This is the detailed design of phases 2, 3 and 4 of [`MULTI-AGENT.md`](MULTI-AGENT.md). It is a plan: each phase is built in its own PR, after Hugo approves this file. If anything here disagrees with `AGENTS.md` or `docs/DELIVERY.md`, those files win until they are amended.

Each phase has the same sections: what it delivers, how it works, security, what Hugo does, acceptance criteria, rollback and open points. Statements that were not checked on this project are marked **to verify**.

## Starting point (phase 1)

- Docker images for development, tests and preview (`Dockerfile`, `compose.yaml`, `docs/DOCKER.md`).
- Work orders: when a stage PR merges, `next-stage.yml` opens a `Run Stage NN: <name>` issue with the kickoff prompt.
- Agents run in their own vendor's environment (a Claude Code routine, a Codex cloud task) and act on GitHub as Hugo through a limited token (`docs/DELIVERY.md`, "Agent identity").
- Hugo starts each stage and approves each stage PR by merging it into `main`.

## Phase 2: one agent, run by the pipeline

### What it delivers

1. A Docker target `agent-runner`.
2. A GitHub App for the agents' identity on GitHub.
3. A workflow `agent-run.yml` that runs one agent on one work order and opens the stage PR.
4. A guide in `docs/agents/` for adding an agent to the runner.

The vendor environments keep working. The pipeline is one more way to start a stage, not a replacement.

### How it works

```
Hugo labels a "Run Stage NN" issue with  agent:<id>
        │
        ▼
agent-run.yml (defined on main)
  job "prepare"   checks who added the label, reads the stage and the agent
  job "work"      runs the agent in the agent-runner image
                  · gets the model key of that agent only
                  · gets NO GitHub write token
                  · leaves its commits in the workspace and its PR text in a file
  job "publish"   checks the result and, if it passes, pushes the branch and opens the PR
                  · uses a short-lived GitHub App token
        │
        ▼
Stage PR → CI, security checks, preview, Copilot review → Hugo merges into main
```

**Why three jobs.** The agent never holds a token that can write to GitHub. It only changes files and commits in its workspace. A separate job with no project code decides whether the result can be published. This keeps the rule "only the pipeline holds credentials" and limits what a confused or manipulated agent can do.

**Job `prepare`:**

- Has two start paths, both owner-validated:
  - **Label path:** runs only if the label was added by the repository owner (`github.event.sender.login == github.repository_owner`) and the issue has the `agent-task` label.
  - **Manual path (`workflow_dispatch`):** runs only if the actor is the repository owner. It has no issue to parse, so the `stage` input is validated against `^[0-9]{2}$`, the stage must be the next `pending` stage in `docs/PLAN.md`, and the job resolves its `Run Stage NN` issue by searching for the open issue with that title and the `agent-task` label. If none exists, the run stops. The kickoff and the issue comments of the later jobs use that issue.
- Reads the stage number from the issue title. It treats the title as data: only `^Run Stage [0-9]{2}:` is accepted, and the number is passed on through an environment variable, never interpolated into a shell command.
- Reads `agents/registry.yaml` (created in phase 2 with one entry) to find how to start that agent and which capabilities it has. If the stage's "Needs" column asks for a capability the agent lacks, the job comments on the issue and stops.
- Refuses to start a new stage if a stage PR is already open (rule 3 of `AGENTS.md`). Follow-up requests on an existing PR use the separate continuation mode described below.

**Job `work`:**

- Runs in `ghcr.io/<owner>/artemis-ii-agent-runner@sha256:…`, pinned by digest.
- Checks out `main` with `persist-credentials: false`, so no token stays in the git configuration.
- Creates the branch `agent/stage-NN-<agent>` locally.
- Starts the agent headless with the kickoff prompt from the issue: "Read AGENTS.md and follow docs/agents/next-stage.md". The agent must write its PR title and body to `.agent/pr-title.txt` and `.agent/pr-body.md`. `.agent/` is git-ignored.
- Exposes only that agent's model key, and only to the step that starts it. The key comes from the GitHub environment `agents`.
- Has `timeout-minutes` set (for example 90). Serialization is not set on this job alone: the whole workflow (`prepare`, `work` and `publish`) runs under one repository-wide `concurrency` group, `agent-run`, without cancelling a run in progress. A lock held only by `work`, or one per stage number, would let two requests for different stages both pass the open-stage-PR guard before either opens a PR, which `AGENTS.md` rule 3 forbids across stages. The open-stage-PR guard of `prepare` runs after the run has acquired that group, so only one request at a time can pass it.
- Scans before it uploads anything. A trusted scan step, run from `main` and not from the repository, checks every commit in the bundle, every file in it and the PR text for the registered model keys and for private keys. Only if the scan passes does it upload the bundle and the `.agent/` PR files as a workflow artifact with short retention (for example 7 days). If it finds a match, nothing is uploaded and the run stops with a security escalation. Agent transcripts and logs are never uploaded; only a short run summary written by the workflow is kept. Log masking does not clean artifacts, so the artifact is a second, independent check on top of the `publish` scan.

**Job `publish`:**

- Has no project code: it does not run npm or any repository script.
- Downloads the bundle and checks it:
  - The diff does not touch protected paths, as `AGENTS.md` defines them (`.github/**`, `AGENTS.md`, `CLAUDE.md`, `REVIEW.md`, `docs/DELIVERY.md`, `docs/agents/**` and security configuration, which is `public/_headers` and the configuration files of the scanners), unless the stage spec lists them. The check reads that definition from the `AGENTS.md` on `main`, so a change to the list there changes the check. When it does, the PR still opens, but as a draft with a warning.
  - No commit message, file or PR text contains secret-like strings or session links. A secret scanner runs over every commit in the bundle and over the PR text before anything is pushed, with patterns for the model keys of the registered providers and for private keys. The privacy filter of `notion-sync.mjs` (GitHub and Notion tokens, emails, session links) is a second check, not the main one, because it does not know model keys. If the scanner is a third-party tool, adding it is justified in the phase 2 PR.
  - The PR title starts with `Stage NN:` and the body follows the template.
- Creates a token for the GitHub App with `actions/create-github-app-token`, scoped to this repository, valid for one hour.
- Pushes only to a ref that matches `agent/stage-NN-*` for the validated stage number, opens the PR with the label `agent-authored`, and comments on the issue with the PR link. The App token is repository-wide, so this destination check is what keeps one run from touching another stage's branch.

**Follow-up runs (continuation mode).** When Hugo or a reviewer asks for changes, Hugo adds the label `agent:<id>` on the existing stage PR. This is a separate mode of the workflow with its own checks, so it does not bypass the guards of a new run:

- The PR is open, comes from a branch of this repository (not a fork), has a title that starts with `Stage `, a head branch `agent/stage-NN-*` or the agent's own prefix, and the label was added by the repository owner.
- The workflow checks out that branch at an exact commit SHA, passes the review comments to the agent as a file (`.agent/review.md`), and the `publish` job pushes the new commits only to that same branch, and only if its head is still that SHA.
- Comments from anyone but Hugo are passed in a separate section marked as untrusted data, as `AGENTS.md` asks.
- Project code runs in this job next to the model key (the agent runs the project's tests). `docs/DELIVERY.md` forbids running PR code with credentials, so this mode needs the narrow exception listed in "Rules that change before phase 2". The key is a dedicated one with a spending limit, and the job has no deployment or storage credentials.

### Why a GitHub App

A pull request opened with the workflow's own `GITHUB_TOKEN` does not start other workflows, so CI and the preview would not run on it (GitHub's rule to prevent loops; **to verify** that it still applies). A token from a GitHub App does start them.

The App also gives agents their own identity. PRs show `<app-name>[bot]` instead of Hugo, which `docs/DELIVERY.md` lists as a wanted improvement.

App permissions:

| Permission | Access | Why |
| --- | --- | --- |
| Contents | Read and write | Push the stage branch |
| Pull requests | Read and write | Open and update the PR |
| Issues | Read and write | Comment on the work order |
| Metadata | Read | Required by GitHub |
| Workflows, Administration, Secrets, Environments, Actions, Deployments | None | The agent identity can never change the pipeline or settings |

The App's private key lives only in the GitHub environment `agents`, which is restricted to `main`.

### Security

- **Who can start a run:** only Hugo, through a label (only people with triage access or more can add labels) or `workflow_dispatch`. The `prepare` job also checks the sender. Comments, issues and PRs from other people never start an agent.
- **Write boundary:** the `main` and tag rulesets do not protect other working branches, and an App installation token is scoped to the repository, not to a branch. The boundary is enforced by the `publish` job (validated destination ref, exact-SHA checks) and verified before phase 2 is considered done (criterion P2-5).
- **Secrets:** each model key is exposed to one step. An agent can still read its own key while it runs, so each key is a dedicated key with a spending limit set in the provider's console, and it is rotated if a run looks wrong.
- **Merging into `main`:** having no bypass is not the same as lacking merge permission: with Contents and Pull requests write access, the App could merge a PR once the required checks pass. What prevents it is the required `approval` check, which only Hugo's click can satisfy, together with the rest of the `main` ruleset. The `publish` code never calls a merge endpoint, and criterion P2-5 tests that a merge attempt by the App on a test PR is refused because `approval` is missing. If GitHub offers an actor-level restriction that blocks merges by the App, it is added and tested too.
- **Workflow files:** the agent token has no Workflows permission, so agents cannot push changes to `.github/workflows/`. The workflows of this phase are proposed in the PR under `docs/agents/workflows/`, and Hugo copies them into `.github/workflows/` himself, as for Stage 03.
- **Network:** GitHub-hosted runners have open outbound network. Optional hardening: an egress audit step such as `step-security/harden-runner`. It is a third-party action, so it needs its own justification before it is added.
- **Logs and artifacts:** GitHub masks registered secrets in logs but does not clean artifacts. Transcripts are not uploaded, and the bundle and PR files are scanned before upload, as described in the `work` job. Remaining artifacts are kept 7 days and can be deleted by hand.
- **Prompt injection:** the agent reads the repository, the spec and the issue that the pipeline wrote. Web pages, NASA metadata and comments from other people stay untrusted data, as `AGENTS.md` says.

### Rules that change before phase 2

Phase 2 needs one amendment before it is built, not after:

- `AGENTS.md` (environment variables for agents) and `docs/DELIVERY.md` ("never run PR code with credentials") do not allow a model key in the agent's job. A narrow exception is proposed in its own PR: model API keys only, in the `work` job, in an environment restricted to `main`, dedicated and with a spending limit. The ban on deployment and storage credentials stays, and the rest of the amendment waits for phase 3.

### What Hugo does

1. Create the GitHub App (only for his account, installed only on this repository, with the permissions above and no webhook), and generate its private key.
2. Create the environment `agents`, restricted to `main`. Add the variable `AGENT_APP_ID` and the secrets `AGENT_APP_PRIVATE_KEY` and one model key per agent (for example `AGENT_KEY_<ID>`).
3. Set a monthly spending limit for each key in its provider's console.
4. Copy the proposed workflows into `.github/workflows/` in the phase 2 PR.
5. For the first test, label a `Run Stage NN` issue with `agent:<id>` for a small task, and compare the PR with one from a vendor environment.

### Acceptance criteria

- **P2-1:** a label added by Hugo starts a run. The same label added by another account does not (checked with a test account, or by reading the `prepare` condition and its test).
- **P2-2:** the `work` job has no GitHub write token. Checked in the job's permissions block, and by a step that fails if `git push` works.
- **P2-3:** a run that touches a protected path not listed in the spec opens a draft PR with a warning. The test covers `AGENTS.md`, `public/_headers` and a scanner configuration file. A direct edit of `.github/workflows/**` is a separate outcome: the App has no Workflows permission, so `publish` does not try to push it. It rejects the run, escalates to Hugo (`needs-hugo`), and the proposed workflow goes through the `docs/agents/workflows/` route for Hugo to copy.
- **P2-4:** the PR opened by the App starts CI and the preview.
- **P2-5:** a merge attempt by the App on a test PR into `main` is refused because `approval` is missing (the App's merge permission is not what stops it), the App cannot push to `.github/workflows/`, and `publish` refuses a destination ref outside `agent/stage-NN-*` and another stage's branch (test with a sandbox branch).
- **P2-6:** two runs never overlap, for the same stage or for different stages, including the `publish` job: a second request waits until the first run has fully finished, and its open-stage-PR guard sees the PR the first run opened.
- **P2-7:** the checks of `publish` have unit tests in `scripts/*.test.mjs`, like the Notion and Linear scripts.

### Rollback

Remove the label `agent:<id>`, or disable `agent-run.yml` in the Actions tab. Vendor environments keep working, because nothing in phase 2 changes them.

### Open points

- Each agent's headless mode and how it authenticates with a key (**to verify** in each vendor's documentation before it is added). Examples to check: Claude Code's print mode or its GitHub Action, `codex exec`, Gemini CLI's prompt flag, `opencode run`.
- The Figma MCP server needs an OAuth login in an approved client, which is unlikely to work in CI (**to verify**). Until it does, stages that need `figma-read` or `figma-write` stay in vendor environments.
- Free Actions minutes for this repository and the maximum time per job (**to verify** on GitHub's live pages).
- The runner image is built by a separate workflow on `main` and published to GitHub Container Registry, which needs `packages: write` in that workflow only.

## Phase 3: the team and iterations

### What it delivers

1. The full agent registry.
2. An orchestrator script that picks a leader and reviewers for each stage.
3. Review jobs run by agents from other providers.
4. Iteration branches `iteration/N`, where approved stages are merged by the pipeline.
5. One PR per iteration into `main`, which Hugo reviews and merges.
6. An amendment of `AGENTS.md` and `docs/DELIVERY.md`, approved by Hugo, that allows all this.

### Registry

`agents/registry.yaml`, one entry per agent:

```yaml
- id: agent-a              # short id used in labels: agent:agent-a
  provider: vendor-a       # reviewers must come from a different provider
  start: "<headless command, verified>"
  key: AGENT_KEY_AGENT_A   # secret name in the agents environment
  capabilities: [git, node, browser, web]
  roles: [lead, review]    # small models may start as reviewers only
  cost: paid               # paid | free-tier | open-weight
  notes: "Rate limit and quota notes, with the date they were checked"
```

Capabilities use the IDs of `docs/agents/README.md`. Adding an agent is a PR that Hugo approves.

### Orchestrator

`scripts/orchestrate.mjs`, with tests, runs in a workflow on `main` with read-only permissions and writes its decision as a file artifact. A second job, with `issues: write` and no project code, posts that decision as a comment on the iteration issue, so every choice can be audited.

**Choosing the leader of a stage:**

1. **Filter:** the agent has every capability in the stage's "Needs" column, has the `lead` role, and did not lead the previous stage.
2. **Score** each remaining agent from 0 to 100:
   - Past results: 50 points. Share of its stage PRs with green CI on the first push and with no blocking review finding, over its last 5 stages. An agent with no history gets 25.
   - Cost: 20 points. Free-tier and open-weight agents score higher, so paid quota is kept for hard stages.
   - Rotation: 20 points for any agent that did not lead the previous stage. The previous leader is also excluded in the eligibility filter above, so rotation is a guarantee and not only a preference. If no other agent is eligible, the run stops and escalates to Hugo (`needs-hugo`) with the reason, instead of silently reusing the previous leader; Hugo can allow it for that stage.
   - Fit: 10 points. A manual hint in the spec, such as "prefers long context".
3. **Ties:** the agent that led less recently.

**Reviewers:** the two best-scored agents with the `review` role whose provider differs from the leader's.

**History** is read from GitHub: closed stage PRs, their labels, checks and review comments. Nothing is written to `main`, so there is no data file to keep in sync.

**Proposals (optional):** before the choice, each eligible agent can be asked for a five-line plan and a risk. The plans are attached to the decision comment for Hugo to read. They do not change the score.

### Iteration flow

```
1. Hugo opens an "Iteration N" issue with the list of stages or improvements, and labels it iteration-approved
2. The pipeline creates iteration/N from main, records its base commit SHA, and runs the orchestrator for the first stage
3. The leader works (phase 2 run) and opens a stage PR against iteration/N
4. Two reviewers review in read-only jobs with no write token at all; a separate trusted publisher posts each review and its verdict
5. The leader addresses the findings (at most 2 rounds)
6. Gate: CI + security checks + source checks + both reviewers report "no blocking findings"
7. The pipeline merges the stage PR into iteration/N and starts the next stage
8. After the last stage, the pipeline opens "Iteration N" PR: iteration/N → main, with a summary and the preview link
9. Hugo reviews the preview once and merges (or comments, and the flow goes back to step 3 for that stage)
```

**Where each run reads its state.** Trusted workflow code always comes from `main`. The work checkout, `docs/PLAN.md` and the stage specs come from a validated iteration base: the ref `iteration/N` at an exact commit SHA that the pipeline records after each integrated stage. Without this, a run after the first stage would read an old plan from `main` and could not find the next spec.

**Sequential first.** Stages run one after another, as today, because each spec is written by the previous stage. Running independent stages in parallel is a later option.

**Reviewer verdict format.** Each reviewer ends with a structured block that the gate can read:

```
<!-- agent-review: {"verdict": "pass" | "blocking", "findings": <count>} -->
```

Reviewer execution never holds a token that can write comments. The reviewer job only produces its text as an output. A separate trusted publisher job, with no project code, attaches the facts it knows and posts the comment, and records the comment ID (in a check run it creates for the exact SHA). The gate accepts only the comment IDs recorded by that publisher, not any matching block authored by the App, so a manipulated reviewer cannot post passes for both reviewers. The block is bound to the facts the job knows, not to what the model says about itself: the reviewer id assigned by the orchestrator, the provider and the head SHA that was reviewed. The gate needs a fresh `pass` from both assigned reviewers for the current head SHA. If the leader pushes again, earlier passes no longer count, and the pipeline merges exactly the SHA that both reviewers passed.

**Content stages (🔍).** A script checks that every fact has a source ID that exists and a link that answers. It checks the draft artifacts of the review stages (`CURATION.md` in Stage 05 and `docs/content-review/` in Stage 08), which is where new facts first appear, and the content collections in the stages that integrate them (Stages 06 and 09). A reviewer checks at least a sample of facts against their sources. A fact that cannot be verified escalates to Hugo.

**Design stages (🎨).** They need Figma, so they keep running in a vendor environment that has the connector. Hugo approves them inside the iteration PR, comparing with the Figma frames.

### Escalation to Hugo

The pipeline adds the label `needs-hugo` to the iteration issue and stops the iteration when:

- a gate fails twice for the same stage;
- a security check reports a finding;
- a fact cannot be verified;
- a change touches the approved design (`Foundations`, `Components`, `Screens`) or a protected path;
- an agent says it is blocked (rule 8 of `AGENTS.md`);
- the iteration reaches its limit of runs (for example 3 runs per stage).

Hugo gets a GitHub notification for the label. A Notion or messaging notice can be added later.

### Rules that change (the amendment)

These need coordinated PRs that Hugo approves before phase 3 is built. Until they are approved, every current gate stays as it is:

| Today | With iterations |
| --- | --- |
| "Never merge PRs" applies to every agent and to the pipeline | The pipeline (not the agents) may merge a stage PR into `iteration/N` when the gate passes. Only Hugo merges into `main`. |
| A stage PR targets `main`, and merging it starts the next stage | A stage PR targets `iteration/N`, and the pipeline starts the next stage after its merge |
| "If a stage PR is open, do not start another stage" | Same rule, per iteration |
| Hugo approves each stage | Hugo approves the iteration plan and the iteration PR |
| `PLAN.md` statuses: pending, in review, approved | Adds `integrated` (merged into `iteration/N`, not yet in `main`). When Hugo accepts an iteration, the iteration PR itself carries the finalization: its last commit changes every `integrated` row of that iteration to `approved`, so `main` never contains `integrated`. `linear-sync.yml` and `notion-sync.yml` keep running only on `main` and keep seeing the three current statuses. `docs/agents/next-stage.md` is amended to count `integrated` as done when it picks the next stage inside an iteration. |
| Merging a stage PR approves the next stage's spec (`docs/specs/README.md`) | The spec written at the end of a stage is approved with the iteration PR, or by Hugo's iteration plan when it is part of it; the pipeline never treats its own merge as that approval |
| Content and design review stages (🔍 🎨 in `docs/PLAN.md`) need Hugo's approval before later stages use the result | These stages keep Hugo's approval inside the iteration, or the iteration plan marks them as a stop where the pipeline waits for him |
| CI runs only on pull requests to `main` | CI, security checks and previews also run on pull requests to `iteration/**`, and every check the gate requires is verified to run there |

`linear-sync.yml` and `notion-sync.yml` keep running only on `main`, so Linear and Notion change when the iteration is accepted.

### Security

- A ruleset on `iteration/*`: PR required, required checks, no force push, no deletion. The only actor that can merge is the App of the gate job, which runs on `main` and checks the gate. The CI trigger migration (`iteration/**`) is part of the phase 3 PR, and it is verified that every required check runs on iteration PRs before the ruleset requires them.
- Reviewer jobs get no write token (`contents: read` only). Posting their comments is done by the trusted publisher job (`pull-requests: write` and `checks: write`, no project code), which also records the comment IDs the gate accepts in a check run on the reviewed SHA. `checks: write` goes only to that job, never to reviewer execution.
- The gate job runs no project code. It reads check results and reviewer blocks through the API.
- `main` keeps its ruleset and Hugo's `approval`. Nothing in phase 3 can merge into `main`.

### What Hugo does

1. Approve the amendment PR.
2. Create the `iteration/*` ruleset.
3. Add the reviewers' keys to the environment `agents`.
4. For each iteration: write the "Iteration N" issue, label it, and review the iteration PR at the end.

### Acceptance criteria

- **P3-1:** the orchestrator's choice is the same when run twice on the same data (unit test).
- **P3-2:** a leader is never reviewed by an agent from the same provider (unit test).
- **P3-3:** a stage PR is merged into `iteration/N` only when every gate condition passes, and never into `main` (test on a sandbox branch).
- **P3-4:** each escalation condition adds `needs-hugo` and stops the iteration (unit tests for the conditions, one real dry run).
- **P3-5:** one full iteration of two small stages runs from the issue to the iteration PR without Hugo, with a log of every decision.

### Rollback

Remove the label `iteration-approved` to stop an iteration. Stage PRs can always be retargeted to `main` and handled as today.

### Open points

- How to count cost per iteration. Each CLI reports usage differently (**to verify**). Until then, limits are runs per stage, job timeouts and each provider's spending limit.
- Whether reviewers should also run the site (tests, screenshots) or only read the diff.
- How many open-weight or free-tier agents can follow `AGENTS.md` reliably. They are added as reviewers first and promoted to leaders after good results.

## Phase 4: own server (only if needed)

### When it is worth it

Only if GitHub-hosted runners fall short, for example:

- runs hit the job time limit or the free minutes;
- an agent needs a persistent login, such as Figma's OAuth, that CI cannot keep;
- running open-weight models locally becomes cheaper than paying for API calls;
- larger caches would make runs much faster.

If none of these happens, phase 4 is not built.

### What it delivers

A small Linux server that runs **self-hosted GitHub Actions runners**. The workflows stay the same. Only `runs-on` changes, through a repository variable, so the switch can be undone in one step.

### How it works

- The runner connects to GitHub (outbound only): the server needs no open inbound port.
- Runners are **ephemeral**: each job gets a fresh container that is deleted after the job, so nothing from one run reaches the next.
- Runners are in a runner group allowed only for this repository and only for `agent-run.yml` and the orchestrator workflows.
- Docker runs rootless, or the runner runs in its own VM, so a job cannot reach the host.

### Security

- Self-hosted runners must never run jobs from fork PRs (GitHub warns about this for public repositories). These workflows start only from Hugo's labels and from `main`, and the runner group is limited to them.
- Secrets stay in GitHub environments. The server stores none, apart from the runner's registration.
- Automatic security updates, SSH with keys only, and no other services on the server.
- If the server is compromised, Hugo removes the runner in GitHub, rotates the model keys and the App key, and rebuilds the server from its setup script.

### Hosting options

To compare when phase 4 starts. Prices and free tiers change, so all of them are **to verify**:

| Option | Fits when | Watch out for |
| --- | --- | --- |
| A free cloud tier with an ARM VM | Cost must be zero | Availability of free capacity, ARM images for every tool |
| A small paid VPS | Predictable monthly cost, simple setup | Monthly fee, the provider's location |
| Hugo's own machine at home | Already exists | Uptime, home network exposure, power |

### What Hugo does

1. Choose the host and create the server.
2. Run the setup script from the phase 4 PR (installs Docker and the runner, hardens SSH).
3. Register the runner in the repository settings, in a runner group limited to the agent workflows.
4. Set the repository variable that switches `runs-on`.

### Acceptance criteria

- **P4-1:** a job on the self-hosted runner leaves no files or containers after it ends.
- **P4-2:** a fork PR cannot run a job on the self-hosted runner.
- **P4-3:** switching the variable back moves every job to GitHub-hosted runners without other changes.

### Rollback

Set the variable back to GitHub-hosted runners and remove the self-hosted runner in the repository settings.

## Order and dependencies

| Step | Depends on | Who |
| --- | --- | --- |
| Phase 1 merged (Docker) | Stage 02 merged | Hugo merges |
| Phase 2 PR (runner image, App, `agent-run.yml`) | Phase 1; Stage 03 pipeline for the `approval` check; the model-key exception | Agent writes, Hugo creates the App and copies the workflows |
| First pipeline run with one agent | Phase 2 | Hugo labels an issue |
| Narrow model-key exception in `AGENTS.md` and `DELIVERY.md` | Before the phase 2 PR is built | Agent proposes, Hugo approves |
| Iteration amendments (approvals, progression, CI triggers) | Phase 2 working for at least one full stage | Agent proposes, Hugo approves |
| Phase 3 PR (registry, orchestrator, review jobs, iteration flow, CI triggers) | Iteration amendments | Agent writes, Hugo configures |
| First iteration | Phase 3 | Hugo writes the iteration plan |
| Phase 4 | A real limit of GitHub-hosted runners | Hugo decides |

The mechanism does not depend on this site. The registry, the orchestrator and the workflows read `AGENTS.md`, `docs/PLAN.md` and the stage specs, so the same setup can build another project that follows the same files.
