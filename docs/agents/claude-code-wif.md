# Claude Code in the pipeline: workload identity federation

Claude Code runs in `agent-run.yml` without a stored Anthropic API key. The `work` job proves its identity with the GitHub Actions OIDC token, and Anthropic exchanges it for a short-lived access token (workload identity federation, WIF). The spec is [`docs/specs/claude-wif.md`](../specs/claude-wif.md); the sources are Anthropic's [workload identity federation](https://platform.claude.com/docs/en/manage-claude/workload-identity-federation), its [GitHub Actions provider](https://platform.claude.com/docs/en/manage-claude/wif-providers/github-actions) and Claude Code's [authentication](https://code.claude.com/docs/en/authentication) pages, checked on 2026-10-19.

## How it works

1. The registry entry `claude` has `auth: federation` and no `key_secret`. `prepare` checks the four repository variables below and passes `auth=federation` on.
2. The `work` job has `permissions: id-token: write`. That lets its own steps ask GitHub for an OIDC token; it writes nothing to the repository.
3. A trusted script from `main` (`scripts/anthropic-oidc.ts`) runs on the runner, outside the agent's container. It fetches a token with the audience `https://api.anthropic.com` and writes it to a file, then replaces the file every two minutes. GitHub's tokens last about five minutes and work once, so a long run needs fresh ones.
4. The agent's container gets only that folder, read-only (`/run/anthropic-oidc`), and the four ids by name. `ACTIONS_ID_TOKEN_REQUEST_URL` and `ACTIONS_ID_TOKEN_REQUEST_TOKEN`, which can mint tokens, never enter any container.
5. Claude Code selects federation because `ANTHROPIC_FEDERATION_RULE_ID` and `ANTHROPIC_ORGANIZATION_ID` are set. It reads `ANTHROPIC_IDENTITY_TOKEN_FILE`, exchanges the token for an access token that lasts about ten minutes, and exchanges the file's newer token when that expires. `ANTHROPIC_API_KEY` outranks federation, so the run unsets it. Federation does not work with `--bare`, which the pipeline does not use.
6. The refresher stops right after the agent and deletes the folder, so a token copied by the agent stops being useful within minutes of the run's end.

## Setup (Hugo)

1. **Claude Console → Connect workload**, GitHub Actions tile:
   - Issuer: `https://token.actions.githubusercontent.com`.
   - Federation rule: match `subject_prefix` `repo:HugoVP/artemis-ii:environment:agents` (the `sub` of a job with `environment: agents`), audience `https://api.anthropic.com`, claim `repository_owner` equal to `HugoVP`. Optionally pin `job_workflow_ref` with a CEL condition to `HugoVP/artemis-ii/.github/workflows/agent-run.yml@refs/heads/main` (and the smoke workflow `claude-wif-smoke.yml`, same ref).
   - Scope `workspace:developer`, token lifetime 600 seconds.
   - Service account: create one and add it to a **dedicated workspace** with a **spend limit**, as with the old key.
2. **Repository variables** (not secrets; Settings → Secrets and variables → Actions → Variables): `ANTHROPIC_FEDERATION_RULE_ID`, `ANTHROPIC_ORGANIZATION_ID`, `ANTHROPIC_SERVICE_ACCOUNT_ID`, `ANTHROPIC_WORKSPACE_ID`. Their values are shown in the Console after step 1.
3. **Delete** the secret `AGENT_KEY_CLAUDE` from the environment `agents` if it exists, and revoke the API key behind it.
4. **Copy the workflows** `agent-run.yml` and `claude-wif-smoke.yml` from `docs/agents/workflows/` to `.github/workflows/`.
5. **Smoke:** run "Claude WIF smoke" by hand on `main`, first without `long`, then with `long`.

To go back to a static key: put `key_secret: AGENT_KEY_CLAUDE` in place of `auth: federation` in `agents/registry.yaml` and create the secret. The `api-key` path of `agent-run.yml` is unchanged.

## What an agent can still do

The agent can read the token file (Claude Code must), so it can use a token for about ten minutes more than the run. Anthropic accepts it only for this rule, in this workspace, with its spend limit and `workspace:developer` scope, which is what the static key allowed, minus its lifetime.

## To verify on the first real run

- **Refresh past ten minutes:** the CLI's refresh behaviour is not documented. Run the smoke with `long`; if the run fails near minute 10 or 20 with an authentication error, the CLI does not re-read the file, and the fallback is the static key.
- **Spend limit:** that the workspace spend limit applies to federated tokens (check the workspace's usage after the smoke).
- **Console history:** that the exchange appears in the Console's history for the service account, with the run's `sub`.
- **Single-use tokens:** that a token is accepted even if the CLI reads the same file twice; if not, shorten `REFRESH_MS` in `scripts/anthropic-oidc.ts`.
- **Sandbox:** that Claude Code's shell sandbox still starts (the federation variables are in its environment, and so is the token file path).
