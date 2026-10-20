# Claude Code through workload identity federation

- **Status:** proposed; requested by Hugo on 2026-10-19 as a maintenance change. It does not start a new site stage.
- **Requirements:** `OPS-08`, `SEC-01`, `SEC-04`, `SEC-07`.
- **Scope:** the Claude Code builder (`runner: claude-print`) of `agent-run.yml` signs in to the Claude API with Anthropic workload identity federation (WIF), using the GitHub Actions OIDC token of the `work` job, instead of the static secret `AGENT_KEY_CLAUDE`. Other agents keep their `AGENT_KEY_<ID>` secret.

## Sources (checked 2026-10-19)

- [Workload identity federation](https://platform.claude.com/docs/en/manage-claude/workload-identity-federation) and its [GitHub Actions provider page](https://platform.claude.com/docs/en/manage-claude/wif-providers/github-actions).
- [Claude Code authentication](https://code.claude.com/docs/en/authentication): Claude Code selects federation when both `ANTHROPIC_FEDERATION_RULE_ID` and `ANTHROPIC_ORGANIZATION_ID` are set, and also reads `ANTHROPIC_SERVICE_ACCOUNT_ID`, `ANTHROPIC_WORKSPACE_ID` and `ANTHROPIC_IDENTITY_TOKEN_FILE`. Not in `--bare` mode. `ANTHROPIC_API_KEY` outranks federation, so it must not be set.
- Refresh ([WIF, "Token lifetime and refresh"](https://platform.claude.com/docs/en/manage-claude/workload-identity-federation#token-lifetime-and-refresh)): the SDK caches the access token, re-exchanges at expiry minus 120 s (advisory) and by expiry minus 30 s (mandatory), and re-reads `ANTHROPIC_IDENTITY_TOKEN_FILE` on every exchange; a re-presented `jti` fails with `jti_reused` on the Console's authentication history page. A `subject_prefix` without a trailing `*` is an exact match.
- GitHub OIDC: the job needs `permissions: id-token: write`. With `environment: agents` the `sub` claim is `repo:HugoVP/artemis-ii:environment:agents`. A JWT lasts about 5 minutes and is single-use (`jti`). The minted Anthropic token lasts at most min(rule lifetime, 2 × the JWT's remaining life), so about 10 minutes; a run lasts up to 90.

## Contract

1. `WIF-01` **Registry.** An entry may declare `auth: federation` instead of `key_secret`. `parseRegistry` accepts `auth: federation` only for `runner: claude-print`, refuses an entry with both `auth: federation` and `key_secret`, and keeps the `AGENT_KEY_<ID>` rule for every other entry (`auth` defaults to `api-key`). The `claude` entry switches to `auth: federation`. The `plan` command prints `auth` and an empty `keySecret` for it; `prepare` outputs `auth`.
2. `WIF-02` **Configuration.** The ids `ANTHROPIC_FEDERATION_RULE_ID`, `ANTHROPIC_ORGANIZATION_ID`, `ANTHROPIC_SERVICE_ACCOUNT_ID` and `ANTHROPIC_WORKSPACE_ID` are not credentials, but they are account identifiers (`docs/DELIVERY.md`), and GitHub prints a step's environment in the log without masking repository variables. So they are **secrets of the environment `agents`**, which GitHub masks. The `work` job's refresher step stops a federation run before the agent starts when one is missing or not a short id (`^[A-Za-z0-9_-]{1,128}$`); `prepare` cannot see them. They are never written to the repository.
3. `WIF-03` **OIDC token kept outside the container.** The `work` job gets `id-token: write` (no other job does). `ACTIONS_ID_TOKEN_REQUEST_URL` and `ACTIONS_ID_TOKEN_REQUEST_TOKEN` never enter any container: `docker run` passes variables by name only, and never these two. A trusted script from `main` (`scripts/anthropic-oidc.ts`), started on the runner like the Figma gateway and only for federation runs, after `npm ci` and before the agent, fetches a JWT with audience `https://api.anthropic.com` at start and then every 60 seconds. It writes each JWT atomically (temporary file next to it, then rename) to `$RUNNER_TEMP/anthropic-oidc/token`, mode 0600, and logs only times and expiry, never the token. The step fails if no token is written within 30 seconds. A step with `if: always()` stops it right after the agent and deletes the folder.
4. `WIF-04` **Agent container.** For federation runs the folder is mounted read-only as a directory (`-v "$RUNNER_TEMP/anthropic-oidc:/run/anthropic-oidc:ro"`, so renames are visible) and the five `ANTHROPIC_*` variables above are passed by name, with `ANTHROPIC_IDENTITY_TOKEN_FILE=/run/anthropic-oidc/token`. The container's output reaches the log only through a trusted filter (`anthropic-oidc.ts redact`) that replaces anything shaped like a JWT, and the secret scan of the result rejects JWTs, so a token the agent prints or commits is never published. The `claude-print` branch fails if a model key is present, and starts `claude -p` with `ANTHROPIC_API_KEY` and `ANTHROPIC_AUTH_TOKEN` unset, never with `--bare`. The step reads no model secret for federation runs (`secrets[...]` only when `auth == 'api-key'`). Rollback: put `key_secret: AGENT_KEY_CLAUDE` back in the registry; the api-key path stays.
5. `WIF-05` **Smoke.** A manual workflow `docs/agents/workflows/claude-wif-smoke.yml` (Hugo on `main` only, environment `agents`, digest-pinned image, no repository writes, no PR) runs the same refresher and container setup on a fixed prompt. Input `long: true` keeps one `claude -p` process alive past 15 minutes (three `sleep 290` shell calls) to show that the CLI re-reads the token file.
6. `WIF-06` **Docs.** `docs/agents/claude-code-wif.md` (or a section of `adding-an-agent.md`): Claude Console → Connect workload wizard → GitHub Actions tile; issuer `https://token.actions.githubusercontent.com`; rule requires the `sub` claim to **equal** `repo:HugoVP/artemis-ii:environment:agents` (`subject_prefix` with that value and no trailing `*`; with a `*` it would also match an unprotected environment such as `agents-other`), audience `https://api.anthropic.com`, claim `repository_owner` = `HugoVP`, optionally `workflow_ref` (not `job_workflow_ref`, which only reusable workflows carry) limited with CEL to `agent-run.yml` or `claude-wif-smoke.yml` and `agent-review.yml` at `refs/heads/main`; the service account in a dedicated workspace with a spend limit; scope `workspace:developer`; token lifetime 600 seconds. Then the four secrets of the environment `agents`, delete `AGENT_KEY_CLAUDE` if it exists, and copy the proposals. `docs/DELIVERY.md` secrets table and `docs/MULTI-AGENT-PHASES.md` say Claude holds no static key.
7. `WIF-07` **Reviewer.** `agent-review.yml` (Phase 3a) runs a federation reviewer the same way: `prepare` passes `auth`; the `review` job gets `id-token: write`, starts and stops the refresher around the reviewer, mounts the token folder read-only, passes the masked ids by name, reads no model secret, unsets `ANTHROPIC_API_KEY` and filters the container's output through `anthropic-oidc.ts redact`. The federation rule's optional `workflow_ref` pin then also allows `agent-review.yml` at `refs/heads/main`.

## Threat model notes

- The agent can read the JWT file (Claude Code must). A stolen JWT is accepted only by Anthropic (audience), only by this rule, for minutes, and buys what the static key bought: workspace-scoped, spend-limited model access. Unlike a static key it stops working about 10 minutes after the run, because the refresher stops.
- The request token stays on the runner, where no project code runs. `permissions` cannot depend on the agent, so `id-token: write` is granted to every `work` job; the refresher runs only for federation runs.

## Allowed protected changes

Proposed `docs/agents/workflows/agent-run.yml`, new proposed `claude-wif-smoke.yml`, `docs/agents/**` and `docs/DELIVERY.md`. Hugo copies the proposals to `.github/workflows/`. No setting, secret or variable is changed by an agent.

## Verification

- `node:test`: registry rules (federation only for `claude-print`, not with `key_secret`, `AGENT_KEY_` kept for others); id validation; refresher writes atomically, never logs the token, retries on failure (local HTTP fake).
- Workflow guards: `id-token: write` only in `work` (and the smoke); `ACTIONS_ID_TOKEN_REQUEST_*` never named in a `docker run` or in `IN_CONTAINER`; the token folder mounted `:ro`; no `ANTHROPIC_API_KEY="$KEY"` on the federation path; refresher stopped with `always()` after the agent and before the commit step.
- The smoke's long mode fails if its single `claude -p` process ends before 15 minutes.
- `npm run check`, `typecheck`, `test:scripts` (two SEC-04 tests need `jq`), `build` and Playwright pass.

## To verify on the first real run

That Claude Code 2.1.302 refreshes from the file past 10 minutes (smoke `long: true`); that no exchange is refused with `jti_reused` in the Console's authentication history (the CLI is expected to follow the SDK schedule; one `claude -p` process only); that the workspace spend limit applies to federated tokens; that the exchange shows in the Console history.

## Out of scope

Federation for other providers, changes to approval or deployment, continuation runs.
