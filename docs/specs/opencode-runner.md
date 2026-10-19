# OpenCode pipeline integration

- **Status:** proposed; Hugo requested this maintenance change on 2026-10-19.
- **Requirements:** `OPS-08`, `SEC-01`, `SEC-04`, `SEC-07`.
- **Scope:** add a selectable OpenCode builder to the existing Phase 2 pipeline. This does not start a new site stage.

## Contract

1. `OPC-01`: pin `opencode-ai` 1.19.3 in the `agent-runner` image. Register `opencode` with `git`, `node`, `browser` and `web`, without Figma capabilities.
2. `OPC-02`: run non-interactively with `opencode-go/glm-5.3` selected in the registry, without a fallback model. The model is configurable through a reviewed registry edit. Only the agent step receives `AGENT_KEY_OPENCODE`, through an environment variable. No login or credential file is created by the launcher.
3. `OPC-03`: retain the existing unprivileged Docker boundary, read-only `.git`, separate publisher, secret scanning and Hugo's approval. Generate a temporary `opencode.json` inside the container, containing an environment placeholder instead of a key, with explicit allow/deny rules and no ask. Disable project configuration, external plugins and session sharing. OpenCode permissions are additional controls, not an operating-system sandbox.
4. `OPC-04`: a separate manual smoke workflow exercises a fixed fixture without opening a PR, modifying the repository or starting a site stage. It accepts only Hugo on `main`, uses the digest-pinned runner image, and validates the resulting files outside the container.
5. `OPC-05`: suppress raw CLI transcripts and identifiers in workflow logs. Report failure on a CLI error event, nonzero exit or missing final completion, without echoing provider errors or credentials.
6. `OPC-06`: document the exact owner setup, image publication, model selection, smoke command and stage command. Live provider access, model quality and spending remain unverified until Hugo configures his key and runs the smoke test.

## Allowed protected changes

The integration changes only the proposed `agent-run.yml`, `agent-runner-image.yml` and `agent-sandbox-smoke.yml` under `docs/agents/workflows/`, adds proposed `opencode-smoke.yml` there, and updates `docs/agents/README.md`, `other-agents.md` and `adding-an-agent.md`, with setup in a new `docs/agents/opencode.md`. Hugo copies the four proposals to `.github/workflows/` on the same PR branch before merging. Every protected path and the new CLI/OS dependencies must be listed in the PR. No repository setting, environment, secret or variable is changed by an agent.

## Verification

- Unit and process tests cover explicit model validation, isolation flags, environment-only authentication, suppressed output and failure propagation.
- A credential-free test with the pinned CLI and a local scripted model endpoint checks headless tool execution and configuration loading, including in the PR image's sandbox smoke workflow.
- Workflow tests cover trusted actor/main guards, one-step key exposure, container mounts and absence of publication credentials in the smoke workflow.
- Existing check/build/test, npm audit, secret scanning and workflow lint remain blocking.
- Hugo runs the real remote smoke after setup, then decides which model is qualified for a stage. Site-stage guards remain unchanged.

## Out of scope

Automatic review, orchestration, continuation of existing PRs, concurrent site stages, Figma access, and changes to approval or deployment policy.
