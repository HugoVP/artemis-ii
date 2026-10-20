# Google Antigravity CLI pipeline integration

- **Status:** proposed; Hugo requested this maintenance change on 2026-10-20 to bring Google's agent and models into the multi-agent pipeline.
- **Requirements:** `OPS-08`, `SEC-01`, `SEC-04`, `SEC-07`.
- **Scope:** add Google's Antigravity CLI (`agy`) as a selectable builder and reviewer. This does not start a new site stage.

## Why the CLI

Antigravity's IDE is interactive and runs on Hugo's machine, so it cannot run in the pipeline. Its CLI can: it has a non-interactive print mode (`-p`) and reads a Gemini API key. Google's own Gemini CLI repository says that Gemini CLI "was replaced by Antigravity CLI on June 18th, 2026" for unpaid and Google One users, and it is not optimized for Gemini 4 Argon, so the integration uses `agy`. Jules, Google's cloud agent, opens its own PRs outside the pipeline's checks and is not used, for the same reason as Copilot's cloud agent.

## Contract

1. `AGY-01`: the `agent-runner` image fetches Antigravity CLI 1.4.3 from the exact build URL in Google's public bucket, checks the sha512 that Google's manifest published for it, installs it root-owned and read-only as `agy`, checks the version while building, and bakes a root-owned launcher, `scripts/antigravity-runner.ts`. Google's install script is not used: it always follows the latest manifest. Register `antigravity` with `git`, `node`, `browser` and `web`, the model family `google`, no Figma, and `status: pending`.
2. `AGY-02`: run in print mode with an explicit model slug from the registry (`auto` refused). Until Hugo sets it, a run of this agent stops in `prepare`, before any key is read. Only the agent step receives `AGENT_KEY_ANTIGRAVITY`, as `GEMINI_API_KEY`; the launcher writes `settings.json` with `modelProvider: "gemini"` in a throwaway home, so the CLI uses the key and never starts a browser sign-in.
3. `AGY-03`: retain the existing unprivileged Docker boundary, read-only `.git`, separate publisher, secret scanning and Hugo's approval. Build mode uses `--mode accept-edits` and approves only `npm`, `npx`, `node`, read-only `git`, `ls` and `mkdir` through `permission.allow`; other actions are denied in print mode. Never `--dangerously-skip-permissions` or `--mode auto`. Slash commands are disabled. No ADC, service account or custom endpoint variable reaches the CLI. The CLI's permissions are additional controls, not an operating-system sandbox.
4. `AGY-04`: a separate manual smoke workflow (`antigravity-smoke.yml`) runs the fixed OpenCode fixture without opening a PR, modifying the repository or starting a site stage, only for Hugo on `main`, and verifies the files outside the container. The PR sandbox smoke checks, without any credential, that the binary and the launcher are in the image and read-only to the agent.
5. `AGY-05`: suppress the transcript. Fail on a nonzero exit, a structured `AGY_ERROR` line (only its status and code are shown), an `Error:` line (redacted), or an interactive sign-in request.
6. `AGY-06`: as a reviewer (`agent-review.yml`), run in `--mode plan` with only read-only `git` approved; the launcher, not the agent, writes the printed answer to `.agent/review.md`, redacted and size-limited. A PR that touches `.gemini/`, `.agents/` or `GEMINI.md` is treated like other agent configuration by the reviewer checks.
7. `AGY-07`: document the owner setup in `docs/agents/antigravity.md`: key, spend cap, secret, label, model choice, image publication and smoke.

## Allowed protected changes

The proposed `agent-run.yml`, `agent-review.yml`, `agent-runner-image.yml` and `agent-sandbox-smoke.yml` under `docs/agents/workflows/`, a new proposed `antigravity-smoke.yml` there, and `docs/agents/README.md`, `other-agents.md`, `adding-an-agent.md` and a new `docs/agents/antigravity.md`. Hugo copies the workflow proposals to `.github/workflows/`. No repository setting, environment, secret or variable is changed by an agent.

## Verification

- Checked on 2026-10-20 with the pinned binary, downloaded from the manifest's URL, sha512 verified, run in an isolated home with no credential: `agy --version` prints `1.4.3`; `--help` lists `--print`, `--model`, `--mode`, `--output-format`, `--disable-slash-commands`, `--log-file`, `--print-timeout`, `--sandbox` and `--dangerously-skip-permissions`; without a key, print mode waits for a browser sign-in. The changelog bundled in the binary documents the Gemini API key setup (`modelProvider: "gemini"` and `GEMINI_API_KEY`), `--mode` being honoured in print mode, `settings.json` permissions (`permission.allow`, `command(...)`) being honoured in print mode, denials not failing a print run, `--model` failing instead of falling back, and `AGY_ERROR` lines with exit code 3.
- Unit and process tests cover the model rule, the argument list and settings, environment isolation, key-only authentication, suppressed output, failure detection and the review file.
- Workflow tests cover the pinned download and hash, trusted actor and `main` guards, one-step key exposure, container mounts, the reviewer branch and the absence of publication credentials in the smoke.
- **To verify on the first real run:** that `command(npm)` approves `npm` with any arguments; that the CLI's background updater (it keeps `updater/` state in its home) neither replaces nor bypasses the pinned binary inside the container; that build mode completes the fixture and its test; duration and cost. If the allow list is not honoured, the smoke fails; the fix is a reviewed change, never `--dangerously-skip-permissions`.

## Risks

- 1.4.3 was published on 2026-10-20, the day of this change. Google's bucket cannot be listed, so no older build could be located; the pinned hash protects against a changed file, not against a faulty release.
- A Gemini API key's spending is bounded by the Google Cloud project's spend cap or prepaid credits, which Hugo sets; the bundled changelog says key sessions stop when that cap is reached.

## Out of scope

Antigravity's IDE and remote control, Jules, Vertex AI or service-account authentication, Figma access, and changes to approval or deployment policy.
