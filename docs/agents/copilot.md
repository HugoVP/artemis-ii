# GitHub Copilot CLI in the remote agent pipeline

GitHub Copilot CLI is a selectable Phase 2 builder. It runs inside the same unprivileged container as Codex, Claude Code and OpenCode, so its result goes through the same scan, protected-path check and trusted publisher. This integration registers `git`, `node`, `browser`, `web` and `figma-read`: on Figma read stages the launcher connects Copilot to the pipeline's Figma gateway with only the read tools ([`copilot-runner.md`](../specs/copilot-runner.md), `CPL-07`). It has no `figma-write`. Contract: [`docs/specs/copilot-runner.md`](../specs/copilot-runner.md).

Copilot's cloud coding agent (assigning an issue to Copilot) is not used: it pushes `copilot/…` branches and opens PRs with its own identity, outside the pipeline's checks.

## Implementation and verification

- Pin `@github/copilot` 1.0.92 in the `agent-runner` image. Its npm package is a loader; it pins the native binary `@github/copilot-linux-x64` at the same version. The image build checks `copilot --version`.
- Bake `scripts/copilot-runner.ts` into `/opt/artemis/` in the reviewed image, root-owned. Changes to it trigger an image build.
- The launcher runs `copilot -p` with `--no-ask-user`, `--no-auto-update`, `--no-remote-export` and `--disable-builtin-mcps` (no GitHub MCP server), an explicit allow list (file writes, `npm`, `npx`, `node`, read-only `git`, `ls`, `mkdir`), a deny list (`git push`, `git commit`, `git config`, `rm`, `gh`, `curl`, `wget`, writes to `.git`) that wins over any approval, and URLs limited to the npm registry and NASA's domains. It strips the token from shell environments, keeps the CLI state in a temporary folder of the container home, and prints neither the transcript nor provider messages, except one redacted `Error:` line.
- The model comes from `agents/registry.yaml`. It must be an explicit id; `auto` is refused, because the model family of an agent must be known to pick reviewers from another family. Until a model is set, a run of this agent stops before any key is read.
- These flags were checked against `copilot --help` of 1.0.92 on 2026-10-19, in an isolated home with no credential. Live access, the model and spending are verified by the smoke below.

## Owner setup

Hugo performs these steps. Agents do not create tokens, secrets, labels or variables, approve environment jobs or merge PRs.

These steps apply the controls of the approved token exception in `docs/DELIVERY.md` ("Approved exception: the GitHub Copilot CLI token").

0. **Recommended: a dedicated GitHub account.** Create a GitHub account used only by the pipeline and give it its own Copilot plan, then do steps 1 to 3 signed in as that account. A leaked token then spends only that account's credits and never reaches your personal account. If you use your own account, every other step still applies.
1. **Browser: Copilot plan and spending cap.** Confirm that the plan includes Copilot CLI and how many AI credits it allows a month; each run spends them. Then, in that account's billing settings, set the budget for Copilot premium requests so that usage stops when it is reached: zero overage, or a small amount you accept. Check the exact names of these settings on GitHub when you do it, and note the limit in the PR that sets the model.
2. **Browser: create the token.** GitHub, **Settings**, **Developer settings**, **Personal access tokens**, **Fine-grained tokens**, **Generate new token**. Give it a name such as `artemis-ii agent pipeline`, an expiration of 90 days or less (set a reminder to rotate it), and no repository access beyond the minimum the form requires (public repositories, read-only). Under **Account permissions**, set **Copilot Requests** to read-only. Grant nothing else. Copy the token; never paste it into a prompt, command argument, PR or chat. To rotate or revoke it later, use the same page: a revoked token stops working at once.
3. **Git Bash: store it through the hidden prompt.**

   ```bash
   gh secret set AGENT_KEY_COPILOT -R HugoVP/artemis-ii --env agents
   ```

4. **Git Bash: create the selection label.**

   ```bash
   gh label create 'agent:copilot' -R HugoVP/artemis-ii --color '0E8A16' --description 'Run a work order with GitHub Copilot CLI'
   ```

5. **Choose the model.** On your machine, signed in to Copilot CLI, run `copilot` and type `/model` to see the ids your plan offers. Prefer a model whose vendor differs from the other agents' (OpenAI for Codex, Anthropic for Claude Code, Zhipu GLM for OpenCode), so Copilot can review their stages. Add it to the `copilot` entry in `agents/registry.yaml` in a reviewed PR, with `model: <id>` and `family: <vendor of that model>` (for example `openai`, `anthropic` or `google`) set together. Leave `status: pending` for now: with no family the orchestrator cannot compare it with the leader, and a pending agent is neither recommended nor accepted as a reviewer.
6. **Install the proposals before merging this integration PR.** On its branch, copy `agent-run.yml`, `agent-runner-image.yml`, `agent-sandbox-smoke.yml` and `copilot-smoke.yml` from `docs/agents/workflows/` to `.github/workflows/`, commit and push, as for OpenCode ([`opencode.md`](opencode.md), step 0).
7. **After merging: publish and select the runner image**, as for OpenCode ([`opencode.md`](opencode.md), step 4), and set `AGENT_RUNNER_IMAGE` to the new digest.
8. **Run the smoke**, once the model is set:

   ```bash
   gh workflow run copilot-smoke.yml -R HugoVP/artemis-ii --ref main
   ```

   ```bash
   gh run list -R HugoVP/artemis-ii --workflow copilot-smoke.yml --limit 3
   ```

   A missing token, model or image, an authentication error, an unexpected file or an incomplete task fails the workflow. Inspect a failure with `gh run view RUN_ID -R HugoVP/artemis-ii --log-failed`, and report only the failed step and its sanitized message.
9. **Activate it** after a passing smoke: set `status: active` in the registry in a reviewed PR. The orchestrator then recommends it as a leader or reviewer.

## To verify on the first real run

- A token with only "Copilot Requests" is enough for the CLI.
- `-p` honours the explicit allow list without `--allow-all-tools` (the 1.0.92 help text calls that flag "required for non-interactive mode"; GitHub's documented Actions example uses `--allow-tool` instead). If not, the smoke fails; the fix is a reviewed change to the lists, never `--allow-all`.
- The chosen model id is accepted, and the CLI completes the fixture and its test with no question to a person.
- Duration and AI credits per run.
