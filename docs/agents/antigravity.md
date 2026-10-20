# Google Antigravity CLI in the remote agent pipeline

Google's Antigravity CLI (`agy`) is a selectable Phase 2 builder and a Phase 3a reviewer, with Gemini models through a Gemini API key. It runs inside the same unprivileged container as the other agents, so its result goes through the same scan, protected-path check and trusted publisher. It registers `git`, `node`, `browser` and `web`, the model family `google`, and no Figma. Contract: [`docs/specs/antigravity-runner.md`](../specs/antigravity-runner.md).

Antigravity's IDE, Gemini CLI (replaced by Antigravity CLI on 2026-06-18 for unpaid and Google One users) and Jules (its own PRs, outside the pipeline's checks) are not used in the pipeline. Hugo can still use the IDE on his machine as a vendor environment, like any other agent.

## Implementation

- The `agent-runner` image downloads Antigravity CLI 1.4.3 from its exact build URL in Google's public bucket, checks the sha512 published in Google's manifest for that build, and installs it root-owned and read-only as `agy`. It does not run Google's install script, which always follows the latest version.
- `scripts/antigravity-runner.ts`, baked into `/opt/artemis/`, writes `settings.json` with `modelProvider: "gemini"` and an explicit `permission.allow` list in a throwaway home, checks the CLI version, and runs `agy --print` with the registry's model:
  - **build:** `--mode accept-edits`, with `npm`, `npx`, `node`, read-only `git`, `ls` and `mkdir` approved;
  - **review:** `--mode plan`, with only read-only `git`; the launcher saves the printed answer as `.agent/review.md`.
- The transcript is never printed. A failure shows only the exit code, the status and code of an `AGY_ERROR` line, or one redacted `Error:` line.

## Owner setup

Hugo performs these steps. Agents do not create keys, secrets, labels or variables, approve environment jobs or merge PRs.

1. **Browser: a Gemini API key with a spend limit.** In Google AI Studio, create an API key in a Google Cloud project used only for this pipeline, and set a spend cap or prepaid credits on that project or its billing account. With a cap, the CLI stops a run when it is reached instead of retrying. Check the exact menu names in AI Studio; they are not verified here. Never paste the key into a prompt, command argument, PR or chat.
2. **Git Bash: store it through the hidden prompt.**

   ```bash
   gh secret set AGENT_KEY_ANTIGRAVITY -R HugoVP/artemis-ii --env agents
   ```

3. **Git Bash: create the selection label.**

   ```bash
   gh label create 'agent:antigravity' -R HugoVP/artemis-ii --color '0E8A16' --description 'Run a work order with Google Antigravity CLI'
   ```

4. **Model (chosen on 2026-10-20).** The registry uses `gemini-4-argon-medium`, with `gemini-3.8-flash-high` as plan B. The suffix of a slug is its reasoning level. Plan B is not automatic: if Argon is refused for your key (one source reports restricted access) or costs too much, change `model:` in `agents/registry.yaml` to the plan B slug in a reviewed PR and run the smoke again. To list the slugs your key can use again: On your machine, in a throwaway home so your own settings stay untouched, list the slugs the key can use (WSL or Linux shell, with `agy` installed from [antigravity.google](https://antigravity.google)):

   ```bash
   export HOME="$(mktemp -d)"; mkdir -p "$HOME/.gemini/antigravity-cli"; echo '{"modelProvider":"gemini"}' > "$HOME/.gemini/antigravity-cli/settings.json"; read -rsp 'Gemini API key: ' GEMINI_API_KEY; export GEMINI_API_KEY; echo; agy models
   ```

   Then close that shell. The slug goes in the `antigravity` entry of `agents/registry.yaml` (`model: <slug>`). The changelog bundled in 1.4.3 mentions Gemini 4 Argon and Gemini 3.8 Flash for API keys; compare their prices in AI Studio.
5. **Install the proposals** of the integration PR in `.github/workflows/` before merging it: `agent-run.yml`, `agent-review.yml`, `agent-runner-image.yml`, `agent-sandbox-smoke.yml` and `antigravity-smoke.yml`, as for OpenCode ([`opencode.md`](opencode.md), step 0).
6. **After merging, publish and select the runner image**, as for OpenCode ([`opencode.md`](opencode.md), step 4).
7. **Run the smoke**, once the model is set:

   ```bash
   gh workflow run antigravity-smoke.yml -R HugoVP/artemis-ii --ref main
   ```

   ```bash
   gh run list -R HugoVP/artemis-ii --workflow antigravity-smoke.yml --limit 3
   ```

8. **Activate it** after a passing smoke: set `status: active` in the registry in a reviewed PR. The orchestrator then recommends it as a leader or reviewer.

## Verified, and still to verify

Verified on 2026-10-20 with the real binary and a dummy key: the launcher's settings make the CLI use the Gemini API key and fail fast on a bad key, never waiting for a browser sign-in; the PR sandbox smoke checks this on every change. The risks of a same-day build and of the background updater, and how they are handled, are in the contract ("Risks and how they are handled").

Still to verify on the first real run:

- `command(npm)` in `permission.allow` approves `npm` with any arguments, so the fixture's `npm test` runs.
- The model slug is accepted, the run completes without asking anything, and the review mode prints a complete review.
- Duration and cost per run.
