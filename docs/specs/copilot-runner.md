# GitHub Copilot CLI pipeline integration

- **Status:** proposed; Hugo requested this maintenance change on 2026-10-19, choosing the CLI inside the pipeline over Copilot's cloud coding agent.
- **Requirements:** `OPS-08`, `SEC-01`, `SEC-04`, `SEC-07`.
- **Scope:** add GitHub Copilot CLI as a selectable builder in the existing Phase 2 pipeline. This does not start a new site stage.

## Why the CLI and not the cloud coding agent

Copilot's cloud coding agent pushes its own `copilot/…` branches and opens PRs with its own identity, so its result would skip the pipeline's scan, protected-path check and trusted publisher, and it breaks rule 2 of `AGENTS.md` (`agent/` branches). The CLI runs in the same unprivileged container as the other agents and leaves its result to the same checks.

## Contract

1. `CPL-01`: pin `@github/copilot` 1.0.92 in the `agent-runner` image (its npm package is a loader that pins the native binary `@github/copilot-linux-x64` at the same version), check the version while building, and bake a root-owned launcher, `scripts/copilot-runner.ts`, into `/opt/artemis/`. Register `copilot` with `git`, `node`, `browser` and `web`, without Figma capabilities.
2. `CPL-02`: run non-interactively (`-p`, `--no-ask-user`, `--no-auto-update`) with an explicit model from the registry. `auto` is refused, because it lets Copilot route to any vendor and the reviewer's model family must be known. Until Hugo sets the model, a run of this agent stops in `prepare`, before any key is read. Only the agent step receives `AGENT_KEY_COPILOT`, as `COPILOT_GITHUB_TOKEN`. The key is a fine-grained personal access token with only the account permission "Copilot Requests" and no repository permission. It is not a model API key: Hugo approved it on 2026-10-19 as an exception to the capped-key rule, under the controls in `docs/DELIVERY.md` ("Approved exception: the GitHub Copilot CLI token"), which `AGENTS.md` refers to. No login or credential file is created.
3. `CPL-03`: retain the existing unprivileged Docker boundary, read-only `.git`, separate publisher, secret scanning and Hugo's approval. Disable Copilot's built-in GitHub MCP servers and session export. Approve only file writes, `npm`, `npx`, `node`, read-only `git`, `ls` and `mkdir`; deny `git push`, `git commit`, `git config`, `rm`, `gh`, `curl`, `wget` and writes to `.git` (denials win over approvals). Allow URLs only for the npm registry and the NASA domains of `docs/SETUP.md`. Strip the token from shell environments. The CLI's permissions are additional controls, not an operating-system sandbox.
4. `CPL-04`: a separate manual smoke workflow (`copilot-smoke.yml`) exercises the fixed fixture of the OpenCode smoke without opening a PR, modifying the repository or starting a site stage. It accepts only Hugo on `main`, uses the digest-pinned runner image, and validates the resulting files outside the container. The PR sandbox smoke checks, without any credential, that the image holds the CLI and a launcher the agent cannot change.
5. `CPL-05`: suppress the CLI transcript in workflow logs. Report failure on a nonzero exit or an `Error:` line, showing at most that line, with the token redacted.
6. `CPL-06`: document the exact owner setup in `docs/agents/copilot.md`: token creation, secret, label, model choice, image publication, smoke and stage commands. Live Copilot access, the model's quality and AI-credit spending remain unverified until Hugo configures the token and runs the smoke.

## Allowed protected changes

The integration changes only the proposed `agent-run.yml`, `agent-runner-image.yml` and `agent-sandbox-smoke.yml` under `docs/agents/workflows/`, adds the proposed `copilot-smoke.yml` there, and updates `docs/agents/README.md`, `other-agents.md` and `adding-an-agent.md`, with setup in a new `docs/agents/copilot.md`. Hugo copies the four proposals to `.github/workflows/` on the same PR branch before merging. Every protected path and the new CLI dependency must be listed in the PR. No repository setting, environment, secret or variable is changed by an agent.

## Verification

- Unit and process tests cover explicit model validation, the argument list (headless flags, allow and deny lists, no `--allow-all`), environment isolation, token-only authentication, suppressed output and failure propagation.
- Flags were checked against `copilot --help` of 1.0.92 on 2026-10-19, installed in an isolated home with no credential; without a token the CLI exits with "No authentication information found" and does not wait for input.
- Workflow tests cover trusted actor and `main` guards, one-step key exposure, container mounts and the absence of publication credentials in the smoke workflow.
- Existing check, build, test, npm audit, secret scanning and workflow lint remain blocking.
- **To verify on the first real run:** that a token with only "Copilot Requests" is enough; that `-p` honours the allow list without `--allow-all-tools` (the help text of 1.0.92 calls that flag "required for non-interactive mode", while GitHub's documented Actions example uses `--allow-tool`); that the chosen model id is accepted; duration and AI credits used. If the allow list is not honoured, the smoke fails and the fix is a reviewed change, not `--allow-all`.

## Out of scope

Automatic selection and review (`docs/specs/orchestration.md`, a separate change), continuation of existing PRs, concurrent site stages, Figma access, Copilot's cloud coding agent, and changes to approval or deployment policy.
