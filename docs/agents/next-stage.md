# Next Stage Agent Instructions

Read this file at startup. It contains the operational instructions for the Artemis II automatic next-stage routine.

## Your Task

1. Read `CLAUDE.md` (project rules) and `docs/PLAN.md` (current status).
2. Take the next stage with status `pending`.
3. If a stage is already `under review`, stop and report to Slack without making changes.
4. Complete the stage: implement, run `npm run build`, update `docs/PLAN.md`, and open the PR.

## Slack Reporting

At the **start** and **end** of each session, send a message to the project Slack thread using the Slack tool.

- **Channel:** `D0C8RDB4G0K`
- **thread_ts:** `1791912708.175219`

### Start message

```
🚀 *Stage NN started:* <stage name>
Branch: `claude/stage-NN-name`
```

### Completion message (PR ready)

```
✅ *Stage NN completed*
PR: <PR link>
Summary: <one or two lines>
```

### Blocked message

```
🔴 *Stage NN blocked*
Draft PR: <link>
Needs from Hugo: <exact description>
```
