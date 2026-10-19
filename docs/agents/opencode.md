# OpenCode in the remote agent pipeline

OpenCode is a selectable Phase 2 builder. OpenCode Go supplies the model; its subscription does not establish that every available model is qualified for a stage. This integration registers `git`, `node`, `browser` and `web`, with no Figma capabilities. Reviewer jobs, automatic model selection and orchestration remain separate work.

## Implementation and verification

- Pin `opencode-ai` 1.19.3 in the `agent-runner` image. Include `jq`, which the existing release-gate tests need.
- Bake `scripts/opencode-runner.ts` into `/opt/artemis/` in the reviewed image. It is root-owned; no trusted runner folder is mounted into the container. Changes to the launcher trigger an image build.
- Read the model from `agents/registry.yaml`, initially `opencode-go/glm-5.3`. Only `opencode-go/<model>` is accepted. The same model handles auxiliary requests, with no silent provider/model fallback. Model changes require a registry PR.
- Pass the dedicated model key in one step only. The launcher supplies `{env:OPENCODE_API_KEY}` in its runtime configuration and never runs an interactive login.
- Generate a temporary `opencode.json` inside the container home, select it with `OPENCODE_CONFIG`, and remove it afterward. Disable project configuration, external plugins, sharing, questions, subagents, MCP and automatic upgrades. Set explicit allow/deny permissions, with no `ask`. The container is the OS boundary; permissions alone do not isolate shell commands.
- Use the existing unprivileged Docker execution, read-only `.git`, scan and publisher for stages. CLI state lives under the container's temporary home and disappears with the container. Transcripts, session identifiers and provider error bodies are neither printed nor uploaded.
- The manual `OpenCode smoke` workflow uses only a fixed fixture and cannot push or open PRs. A trusted step checks its exact files after the agent exits.
- The PR sandbox smoke builds the runner and verifies the real CLI against the local scripted model without a real key; it also checks that the image's launcher is not writable by the container user.
- Proposals retain the action pins already active on `main`. The agent pushes only `docs/agents/workflows/`; Hugo installs all four proposals on the same PR branch before merging.

The pinned CLI passed `node scripts/verify-opencode-cli.ts` against a local scripted endpoint on 2026-10-19, with a dummy credential and a fresh temporary home. That verifies headless tools, configuration isolation, fixture output and absence of the dummy key in persisted CLI state. Real Go access, remote container execution and model quality remain pending owner verification. See [`other-agents.md`](other-agents.md) for the official sources and version-specific behavior.

## Owner setup in Git Bash

Hugo performs these steps. Agents do not create secrets, change variables, approve environment jobs or merge PRs.

0. **Install the proposals before merging.** In a clean clone, check out this integration PR and copy the four files on its branch:

   ```bash
   gh pr checkout agent/opencode-agent -R HugoVP/artemis-ii
   for name in agent-run.yml agent-runner-image.yml agent-sandbox-smoke.yml opencode-smoke.yml; do
     cp "docs/agents/workflows/$name" ".github/workflows/$name" || exit 1
   done
   git diff -- .github/workflows/
   git add -- .github/workflows/agent-run.yml .github/workflows/agent-runner-image.yml .github/workflows/agent-sandbox-smoke.yml .github/workflows/opencode-smoke.yml
   git commit -m 'Install reviewed OpenCode workflow proposals'
   git push origin agent/opencode-agent
   gh pr checks agent/opencode-agent -R HugoVP/artemis-ii --watch
   ```

   Review the PR image smoke, including its credential-free OpenCode step. Resolve any failing checks on this branch; do not disable them. Review the remaining pending live-provider items, mark the PR ready, then merge it yourself. The following setup runs after merge. This is maintenance, not a new stage; do not change the site-stage status.

1. **Browser: Go Console.** Create a dedicated pipeline API key in the single-member Go workspace. Confirm its limits and keep `Use balance` disabled if requests must stop at the subscription allowance. Never paste the key into a prompt, command argument, PR or chat.
2. **Git Bash: store the key through the hidden prompt.** The existing `agents` environment must remain restricted to `main`.

   ```bash
   gh secret set AGENT_KEY_OPENCODE -R HugoVP/artemis-ii --env agents
   ```

3. **Create the selection label.** The registry already selects GLM-5.3. Its identifier was verified with `opencode models opencode-go`; no model repository variable is required:

   ```bash
   gh label create 'agent:opencode' -R HugoVP/artemis-ii --color '0E8A16' --description 'Run a work order with OpenCode'
   ```

   Create the label once; if it already exists, keep it. The CLI/model pair must be evaluated together. The local GLM review trial was only partial; use independent review and small builder tasks, not reviewer or design assignments. Do not change workspace privacy regions automatically.

4. **Publish and select the runner image.** Merging the Dockerfile/launcher changes triggers `Agent runner image`. List runs, choose the successful run for the integration commit and open its summary:

   ```bash
   gh run list -R HugoVP/artemis-ii --workflow agent-runner-image.yml --limit 5
   gh run view IMAGE_RUN_ID -R HugoVP/artemis-ii --web
   ```

   If the image workflow did not start, dispatch it once:

   ```bash
   gh workflow run agent-runner-image.yml -R HugoVP/artemis-ii --ref main
   ```

   Copy the full `ghcr.io/...@sha256:...` reference from that run's summary, then set it yourself:

   ```bash
   gh variable set AGENT_RUNNER_IMAGE -R HugoVP/artemis-ii --body 'FULL_IMAGE_REFERENCE_FROM_SUMMARY'
   ```

5. **Run the remote smoke.** It does not start a site stage, so it may run while Stage 04 is under review:

   ```bash
   gh workflow run opencode-smoke.yml -R HugoVP/artemis-ii --ref main
   gh run list -R HugoVP/artemis-ii --workflow opencode-smoke.yml --limit 5
   gh run watch SMOKE_RUN_ID -R HugoVP/artemis-ii --exit-status
   ```

   Success requires CLI completion and exact fixture verification. A missing key/model/image, provider error, unexpected file or incomplete task fails the workflow. To inspect a failure:

   ```bash
   gh run view SMOKE_RUN_ID -R HugoVP/artemis-ii --log-failed
   ```

   The launcher prints only a generic failure and an HTTP status when available, never raw provider output. Report the failed step and sanitized message; never send a key, auth file or transcript.

6. **Assign actual work after qualification.** Wait for PR #31 to be merged and for no other stage PR to be open. After the remote smoke passes, Hugo decides whether the next pending stage is small and sufficiently specified for GLM-5.3, and needs no Figma. Replace `NN` with that stage number only after checking `docs/PLAN.md` and its spec:

   ```bash
   gh workflow run agent-run.yml -R HugoVP/artemis-ii --ref main -f stage=NN -f agent=opencode
   ```

   Smoke success alone does not establish research or review quality. Keep independent review. Changes requested on an existing stage PR stay on that branch; the pipeline's continuation mode is not part of this integration.

## Developer-side checks

The integration PR includes its contract in `docs/specs/opencode-runner.md`, registry and runner support, proposed workflows, pinned CLI/launcher, fixture verification, process and workflow tests, and this owner guide. It must pass check/build/test, npm audit, secret scanning and workflow lint before Hugo's approval. Existing stage guards and deployment controls are retained.

## To verify on the first real run

- Go accepts the dedicated environment key without an interactive login; the local endpoint test proves substitution, not real Go access.
- The published Debian Bookworm image runs the pinned CLI, Node 22 and its Playwright Chromium successfully on GitHub's runner. The Ubuntu 24.04 local trial does not prove this container combination.
- The selected digest contains OpenCode 1.19.3 and its root-owned launcher; an older digest must fail clearly.
- GLM-5.3 completes the exact fixture and its test under non-interactive allow/deny permissions; no prompt requires a person to answer.
- Confirm current Go per-model limits, privacy and balance settings in the console. The integration does not change them.
- Check model output and rule compliance independently before assigning a real stage. No model passed all historical review expectations, and this integration grants no reviewer or Figma capability.
