# GitHub Copilot CLI in the remote agent pipeline

GitHub Copilot CLI is a selectable Phase 2 builder. It runs inside the same unprivileged container as Codex, Claude Code and OpenCode, so its result goes through the same scan, protected-path check and trusted publisher. This integration registers `git`, `node`, `browser` and `web`, with no Figma capabilities. Contract: [`docs/specs/copilot-runner.md`](../specs/copilot-runner.md).

Copilot's cloud coding agent (assigning an issue to Copilot) is not used: it pushes `copilot/…` branches and opens PRs with its own identity, outside the pipeline's checks.

## Implementation and verification

- Pin `@github/copilot` 1.0.92 in the `agent-runner` image. Its npm package is a loader; it pins the native binary `@github/copilot-linux-x64` at the same version. The image build checks `copilot --version`.
- Bake `scripts/copilot-runner.ts` into `/opt/artemis/` in the reviewed image, root-owned. Changes to it trigger an image build.
- The launcher runs `copilot -p` with `--no-ask-user`, `--no-auto-update`, `--no-remote-export` and `--disable-builtin-mcps` (no GitHub MCP server), an explicit allow list (file writes, `npm`, `npx`, `node`, read-only `git`, `ls`, `mkdir`), a deny list (`git push`, `git commit`, `git config`, `rm`, `gh`, `curl`, `wget`, writes to `.git`) that wins over any approval, and URLs limited to the npm registry and NASA's domains. It strips the token from shell environments, keeps the CLI state in a temporary folder of the container home, and prints neither the transcript nor provider messages, except one redacted `Error:` line.
- The model comes from `agents/registry.yaml`. It must be an explicit id; `auto` is refused, because the model family of an agent must be known to pick reviewers from another family. Until a model is set, a run of this agent stops before any key is read.
- These flags were checked against `copilot --help` of 1.0.92 on 2026-10-19, in an isolated home with no credential. Live access, the model and spending are verified by the smoke below.

## Owner setup

Hugo performs these steps. Agents do not create tokens, secrets, labels or variables, approve environment jobs or merge PRs.

1. **Browser: Copilot plan.** Confirm that your Copilot plan includes Copilot CLI and how many AI credits it allows a month. Each run of the agent spends them under your account.
2. **Browser: create the token.** GitHub, **Settings**, **Developer settings**, **Personal access tokens**, **Fine-grained tokens**, **Generate new token**. Give it a name such as `artemis-ii agent pipeline`, an expiration date, and no repository access beyond the minimum the form requires (public repositories, read-only). Under **Account permissions**, set **Copilot Requests** to read-only. Grant nothing else. Copy the token; never paste it into a prompt, command argument, PR or chat.
3. **Git Bash: store it through the hidden prompt.**

   ```bash
   gh secret set AGENT_KEY_COPILOT -R HugoVP/artemis-ii --env agents
   ```

4. **Git Bash: create the selection label.**

   ```bash
   gh label create 'agent:copilot' -R HugoVP/artemis-ii --color '0E8A16' --description 'Run a work order with GitHub Copilot CLI'
   ```

5. **Choose the model.** On your machine, signed in to Copilot CLI, run `copilot` and type `/model` to see the ids your plan offers. Prefer a model whose vendor differs from the other agents' (OpenAI for Codex, Anthropic for Claude Code, Zhipu GLM for OpenCode), so Copilot can review their stages. Add it to the `copilot` entry in `agents/registry.yaml` (`model: <id>`) in a reviewed PR.
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

## To verify on the first real run

- A token with only "Copilot Requests" is enough for the CLI.
- `-p` honours the explicit allow list without `--allow-all-tools` (the 1.0.92 help text calls that flag "required for non-interactive mode"; GitHub's documented Actions example uses `--allow-tool` instead). If not, the smoke fails; the fix is a reviewed change to the lists, never `--allow-all`.
- The chosen model id is accepted, and the CLI completes the fixture and its test with no question to a person.
- Duration and AI credits per run.
