// Checks of the agent-review workflow: who may review which stage PR, what a review must look like, and how the
// trusted publisher turns it into a comment and a check run. Pure functions plus a small CLI (Node 22).
// Contract: docs/specs/agent-review.md (REV-01 to REV-11). Design: docs/MULTI-AGENT-PHASES.md, "Phase 3".
import { readFile, writeFile, lstat } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { parseRegistry, findSecrets, matchesProtected, parsePathList, type Agent } from "./agent-checks.ts";
import { validateOrchestration } from "./orchestrate.ts";
import { parseStages, type Stage } from "./next-stage-issue.ts";
import { validateOpenCodeModel } from "./opencode-runner.ts";
import { validateCopilotModel } from "./copilot-runner.ts";

export type VerdictKind = "pass" | "blocking";
export interface Verdict { verdict: VerdictKind; findings: number }

export const MAX_REVIEW_BYTES = 256 * 1024;
export const MAX_COMMENT_CHARS = 60_000;
export const MAX_FINDINGS = 500;

function scalar(agent: Agent, field: string): string {
  const value = agent[field];
  return typeof value === "string" ? value : "";
}

function list(agent: Agent, field: string): string[] {
  const value = agent[field];
  return Array.isArray(value) ? value : value ? [value] : [];
}

// REV-07: the review ends with exactly one block, on its last line, with exactly these two keys.
export function parseVerdict(text: string): { ok: true; verdict: Verdict; body: string } | { ok: false; reason: string } {
  const s = String(text ?? "").replace(/\r\n/g, "\n");
  const markers = s.match(/<!--\s*agent-review\s*:/g) ?? [];
  if (markers.length === 0) return { ok: false, reason: "The review has no verdict block." };
  if (markers.length > 1) return { ok: false, reason: "The review has more than one verdict block." };
  const m = /<!--\s*agent-review\s*:\s*(\{[^\n]*\})\s*-->[ \t]*$/.exec(s.trimEnd());
  if (!m) return { ok: false, reason: "The verdict block must be the last line of the review." };
  let data: unknown;
  try { data = JSON.parse(m[1]); } catch { return { ok: false, reason: "The verdict block is not valid JSON." }; }
  if (typeof data !== "object" || data === null || Array.isArray(data)) return { ok: false, reason: "The verdict block must be a JSON object." };
  const keys = Object.keys(data).sort();
  if (keys.join(",") !== "findings,verdict") return { ok: false, reason: 'The verdict block must have exactly the keys "verdict" and "findings".' };
  const { verdict, findings } = data as { verdict: unknown; findings: unknown };
  if (verdict !== "pass" && verdict !== "blocking") return { ok: false, reason: 'The verdict must be "pass" or "blocking".' };
  if (!Number.isInteger(findings) || (findings as number) < 0 || (findings as number) > MAX_FINDINGS) return { ok: false, reason: `"findings" must be an integer from 0 to ${MAX_FINDINGS}.` };
  if (verdict === "blocking" && findings === 0) return { ok: false, reason: 'A "blocking" verdict needs at least one finding.' };
  const body = s.trimEnd().slice(0, m.index).trim();
  if (body === "") return { ok: false, reason: "The review has no text before its verdict block." };
  return { ok: true, verdict: { verdict, findings: findings as number }, body };
}

// The leader of a stage PR is the <id> suffix of its branch, agent/stage-NN-<id>.
export function leaderFromBranch(branch: string | null | undefined): { stage: string; leader: string } | null {
  const m = /^agent\/stage-([0-9]{2})-([a-z0-9][a-z0-9-]{0,29})$/.exec(String(branch ?? ""));
  return m ? { stage: m[1], leader: m[2] } : null;
}

// The fields of `gh pr view --json number,state,isCrossRepository,headRefName,headRefOid,baseRefName,title`.
export interface PullRequest {
  number: number;
  state: string;
  isCrossRepository: boolean;
  headRefName: string;
  headRefOid: string;
  baseRefName: string;
  title: string;
}

// REV-02: an open stage PR of this repository, into the default branch, with a branch and title for the same stage.
export function checkPullRequest(pr: PullRequest, defaultBranch: string): string[] {
  const problems: string[] = [];
  if (!Number.isInteger(pr.number) || pr.number <= 0) problems.push("The PR number is invalid.");
  if (pr.state !== "OPEN") problems.push("The PR is not open.");
  if (pr.isCrossRepository !== false) problems.push("The PR comes from a fork.");
  if (pr.baseRefName !== defaultBranch) problems.push(`The PR does not target ${defaultBranch}.`);
  if (!/^[0-9a-f]{40}$/.test(String(pr.headRefOid))) problems.push("The PR head SHA is invalid.");
  const branch = leaderFromBranch(pr.headRefName);
  if (!branch) problems.push("The PR head branch is not agent/stage-NN-<agent>.");
  else if (!String(pr.title).startsWith(`Stage ${branch.stage}:`)) problems.push(`The PR title must start with "Stage ${branch.stage}:".`);
  return problems;
}

// REV-03: an active reviewer with the review role, from a model family other than the leader's.
export function checkReviewer(agents: Agent[], reviewerId: string, leaderId: string): { ok: true; reviewer: Agent; leader: Agent } | { ok: false; reason: string } {
  validateOrchestration(agents);
  if (!/^[a-z0-9-]{1,30}$/.test(String(reviewerId))) return { ok: false, reason: "The reviewer id is invalid." };
  const reviewer = agents.find((a) => a.id === reviewerId);
  if (!reviewer) return { ok: false, reason: `Reviewer "${reviewerId}" is not in agents/registry.yaml.` };
  if ((scalar(reviewer, "status") || "pending") !== "active") return { ok: false, reason: `Reviewer ${reviewer.id} is not active in the registry.` };
  if (!list(reviewer, "roles").includes("review")) return { ok: false, reason: `Reviewer ${reviewer.id} has no review role.` };
  if (!scalar(reviewer, "family")) return { ok: false, reason: `Reviewer ${reviewer.id} has no model family.` };
  try {
    if (reviewer.runner === "opencode-run") validateOpenCodeModel(reviewer.model);
    if (reviewer.runner === "copilot-cli") validateCopilotModel(reviewer.model);
  } catch { return { ok: false, reason: `Reviewer ${reviewer.id} has no valid explicit model.` }; }
  const leader = agents.find((a) => a.id === leaderId);
  if (!leader) return { ok: false, reason: `The head branch names "${leaderId}", which is not a registry agent, so its model family is unknown. Hugo reviews this PR.` };
  if (!scalar(leader, "family")) return { ok: false, reason: `The leader ${leader.id} has no model family in the registry.` };
  if (leader.id === reviewer.id) return { ok: false, reason: "An agent cannot review its own PR." };
  if (scalar(leader, "family") === scalar(reviewer, "family")) return { ok: false, reason: `Reviewer ${reviewer.id} has the leader's model family (${scalar(leader, "family")}).` };
  return { ok: true, reviewer, leader };
}

// Everything the later jobs need, derived from main's registry and plan and from the API, never from a model.
export interface ReviewFacts {
  pr: number;
  head: string;
  branch: string;
  stage: string;
  spec: string;
  leader: string;
  leaderFamily: string;
  reviewer: string;
  name: string;
  family: string;
  provider: string;
  model: string;
  runner: string;
  keySecret: string;
  // api-key or federation (docs/specs/claude-wif.md): a federation reviewer has no key_secret.
  auth: string;
}

export function reviewFacts({ agents, stages, pr, reviewerId, defaultBranch }: {
  agents: Agent[];
  stages: Stage[];
  pr: PullRequest;
  reviewerId: string;
  defaultBranch: string;
}): { ok: true; facts: ReviewFacts } | { ok: false; reasons: string[] } {
  const problems = checkPullRequest(pr, defaultBranch);
  if (problems.length) return { ok: false, reasons: problems };
  const { stage, leader: leaderId } = leaderFromBranch(pr.headRefName)!;
  const r = checkReviewer(agents, reviewerId, leaderId);
  if (!r.ok) return { ok: false, reasons: [r.reason] };
  const specPath = stages.find((s) => s.number === stage)?.specPath ?? "";
  const spec = /^docs\/specs\/stage-[0-9]{2}-[a-z0-9-]+\.md$/.test(specPath) ? specPath : "";
  return {
    ok: true,
    facts: {
      pr: pr.number, head: pr.headRefOid, branch: pr.headRefName, stage, spec,
      leader: r.leader.id, leaderFamily: scalar(r.leader, "family"),
      reviewer: r.reviewer.id, name: scalar(r.reviewer, "name") || r.reviewer.id, family: scalar(r.reviewer, "family"),
      provider: scalar(r.reviewer, "provider"), model: scalar(r.reviewer, "model"),
      runner: r.reviewer.runner, keySecret: r.reviewer.key_secret, auth: r.reviewer.auth,
    },
  };
}

// REV-04: files a reviewer CLI could load as configuration from the checkout. On main they are trusted; in a PR not.
export const AGENT_CONFIG_PATHS = [
  ".agent", ".agent/**",
  ".claude", ".claude/**", ".codex", ".codex/**", ".opencode", ".opencode/**", ".copilot", ".copilot/**",
  "opencode.json", "opencode.jsonc", ".mcp.json", ".github/hooks/**",
];

export function agentConfigTouched(files: string[]): string[] {
  return files.filter((f) => matchesProtected(f, AGENT_CONFIG_PATHS));
}

// REV-08: what may leave the review job at all: small UTF-8 text with nothing secret-like in it.
export function checkSafe(bytes: Uint8Array): { ok: true; text: string } | { ok: false; reason: string } {
  if (bytes.length === 0) return { ok: false, reason: "The review is empty." };
  if (bytes.length > MAX_REVIEW_BYTES) return { ok: false, reason: `The review is larger than ${MAX_REVIEW_BYTES / 1024} KiB.` };
  if (bytes.includes(0)) return { ok: false, reason: "The review contains NUL bytes." };
  let text: string;
  try { text = new TextDecoder("utf-8", { fatal: true }).decode(bytes); } catch { return { ok: false, reason: "The review is not valid UTF-8." }; }
  // Only the names of the kinds found, never the matched text.
  const secrets = findSecrets(text);
  if (secrets.length) return { ok: false, reason: `The review contains secret-like content: ${secrets.join(", ")}.` };
  return { ok: true, text };
}

// REV-09: what the publisher accepts: a safe file that also ends with a valid verdict block.
export function validateArtifact(bytes: Uint8Array): { ok: true; verdict: Verdict; body: string } | { ok: false; reason: string } {
  const safe = checkSafe(bytes);
  return safe.ok ? parseVerdict(safe.text) : safe;
}

// Refuses a missing file, a symlink or anything but a regular file before reading it.
async function readRegular(path: string): Promise<{ ok: true; bytes: Buffer } | { ok: false; reason: string }> {
  const info = await lstat(path).catch(() => null);
  if (!info) return { ok: false, reason: "The reviewer did not write .agent/review.md." };
  if (!info.isFile()) return { ok: false, reason: ".agent/review.md is not a regular file." };
  if (info.size > MAX_REVIEW_BYTES) return { ok: false, reason: `The review is larger than ${MAX_REVIEW_BYTES / 1024} KiB.` };
  return { ok: true, bytes: await readFile(path) };
}

export async function scanArtifact(path: string): Promise<{ ok: true } | { ok: false; reason: string }> {
  const file = await readRegular(path);
  if (!file.ok) return file;
  const safe = checkSafe(file.bytes);
  return safe.ok ? { ok: true } : safe;
}

export async function readArtifact(path: string): Promise<ReturnType<typeof validateArtifact>> {
  const file = await readRegular(path);
  return file.ok ? validateArtifact(file.bytes) : file;
}

// The reviewer's text cannot add blocks, ping people or exceed the comment limit.
export function neutralize(text: string): string {
  let s = String(text).replace(/<!--/g, "&lt;!--").replace(/(^|[^A-Za-z0-9_`])@(?=[A-Za-z0-9])/g, "$1@​");
  if (s.length > MAX_COMMENT_CHARS) s = `${s.slice(0, MAX_COMMENT_CHARS)}\n\n_(Cut by the publisher at ${MAX_COMMENT_CHARS} characters.)_`;
  return s;
}

// The publisher's block: the verdict plus the facts the pipeline knows.
export function record(facts: ReviewFacts, verdict: Verdict): Record<string, string | number> {
  return {
    verdict: verdict.verdict, findings: verdict.findings,
    reviewer: facts.reviewer, family: facts.family, provider: facts.provider, model: facts.model,
    leader: facts.leader, pr: facts.pr, head: facts.head,
  };
}

// REV-09: the comment. Facts come first, from the pipeline; the reviewer's text follows, neutralized.
export function buildComment(facts: ReviewFacts, verdict: Verdict, body: string, { runUrl, currentHead }: { runUrl: string; currentHead: string }): string {
  const lines = [
    `### Agent review by \`${facts.reviewer}\` (${facts.name})`,
    "",
    "| | |",
    "| --- | --- |",
    `| Verdict | **${verdict.verdict}**, ${verdict.findings} finding${verdict.findings === 1 ? "" : "s"} |`,
    `| Reviewed commit | \`${facts.head}\` |`,
    `| Reviewer | \`${facts.reviewer}\`, model family ${facts.family}, provider ${facts.provider || "unknown"}${facts.model ? `, model \`${facts.model}\`` : ""} |`,
    `| Leader | \`${facts.leader}\`, model family ${facts.leaderFamily} |`,
    `| Run | ${runUrl} |`,
    "",
    "The table and the block at the end are written by the pipeline's publisher from facts it knows, not from the reviewer's text. The verdict is advice for Hugo, who still decides and merges.",
  ];
  if (currentHead && currentHead !== facts.head) lines.push("", `> The PR head moved to \`${currentHead}\` while the review ran. This verdict covers \`${facts.head}\` only.`);
  lines.push("", "---", "", neutralize(body), "", `<!-- agent-review: ${JSON.stringify(record(facts, verdict))} -->`, "");
  return lines.join("\n");
}

// REV-10: the notice for a review that cannot be published. The reason comes from these checks, never from the model.
export function failureComment(facts: Pick<ReviewFacts, "reviewer" | "head">, reason: string, runUrl: string): string {
  return [
    `### Agent review by \`${facts.reviewer}\`: not published`,
    "",
    `The review of commit \`${facts.head}\` was not published: ${reason}`,
    "",
    `Run: ${runUrl}`,
    "",
  ].join("\n");
}

// REV-09: the check run that records the comment id on the reviewed SHA. Not a required check.
export function buildCheckRun(facts: ReviewFacts, verdict: Verdict | null, commentId: number, commentUrl: string, reason = ""): Record<string, unknown> {
  if (!Number.isInteger(commentId) || commentId <= 0) throw new Error("The comment id is invalid.");
  const title = verdict ? `${verdict.verdict}: ${verdict.findings} finding${verdict.findings === 1 ? "" : "s"}` : "No valid review";
  return {
    name: `agent-review / ${facts.reviewer}`,
    head_sha: facts.head,
    status: "completed",
    conclusion: verdict?.verdict === "pass" ? "success" : "failure",
    external_id: String(commentId),
    ...(/^https:\/\/github\.com\//.test(commentUrl) ? { details_url: commentUrl } : {}),
    output: {
      title,
      summary: verdict
        ? `Review by \`${facts.reviewer}\` (model family ${facts.family}) of \`${facts.head}\`, published as comment ${commentId}.`
        : `The review by \`${facts.reviewer}\` of \`${facts.head}\` was not published: ${reason} Notice: comment ${commentId}.`,
      text: JSON.stringify({ ...(verdict ? record(facts, verdict) : { verdict: "invalid", reviewer: facts.reviewer, head: facts.head }), comment: commentId }),
    },
  };
}

// Values that go to $GITHUB_OUTPUT: one line each, from a fixed character set.
export function outputLines(facts: ReviewFacts): string {
  const values: Record<string, string> = {
    pr: String(facts.pr), head: facts.head, branch: facts.branch, stage: facts.stage, spec: facts.spec,
    leader: facts.leader, reviewer: facts.reviewer, runner: facts.runner, model: facts.model, key_secret: facts.keySecret, auth: facts.auth,
  };
  for (const [k, v] of Object.entries(values)) if (!/^[A-Za-z0-9._/-]*$/.test(v)) throw new Error(`Unsafe value for ${k}.`);
  return Object.entries(values).map(([k, v]) => `${k}=${v}`).join("\n") + "\n";
}

async function loadFacts(registry: string, plan: string, prJson: string, reviewer: string, defaultBranch: string) {
  return reviewFacts({
    agents: parseRegistry(await readFile(registry, "utf8")),
    stages: parseStages(await readFile(plan, "utf8")),
    pr: JSON.parse(await readFile(prJson, "utf8")) as PullRequest,
    reviewerId: reviewer,
    defaultBranch,
  });
}

// CLI used by agent-review.yml. Each command exits non-zero on failure and never prints the reviewer's text.
//   facts <registry.yaml> <PLAN.md> <pr.json> <reviewer> <default-branch>            prints key=value lines
//   config-touched <NUL-separated-files-file>
//   scan <review.md>                                                                 safe to upload (review job)
//   bind <registry.yaml> <PLAN.md> <pr.json> <reviewer> <default-branch> <head> <facts-out>
//   comment <review.md> <facts.json> <current-head> <run-url> <comment.json-out> <verdict-out>   exit 3: invalid, notice written
//   check-run <facts.json> <verdict.json> <comment-id> <comment-url> <out>
async function main(argv: string[]): Promise<number> {
  const [cmd, ...args] = argv;
  if (cmd === "facts") {
    const r = await loadFacts(args[0], args[1], args[2], args[3], args[4]);
    if (!r.ok) { for (const reason of r.reasons) console.error(reason); return 1; }
    process.stdout.write(outputLines(r.facts));
    return 0;
  }
  if (cmd === "config-touched") {
    const touched = agentConfigTouched(parsePathList(await readFile(args[0], "utf8")));
    if (touched.length) console.error(`The PR changes agent tool configuration, so no agent reviews it: ${touched.join(", ")}. Hugo reviews it.`);
    else console.log("no agent tool configuration changed");
    return touched.length ? 1 : 0;
  }
  if (cmd === "scan") {
    // The review job: nothing secret-like leaves it. The verdict is checked by the publisher, which reports it.
    const r = await scanArtifact(args[0]);
    console.log(r.ok ? "the review can be uploaded" : r.reason);
    return r.ok ? 0 : 1;
  }
  if (cmd === "bind") {
    // The publisher derives the facts again from main's registry and the PR as it is now. The SHA it binds is the one
    // prepare recorded and the review job checked out; a head that moved since is reported, not adopted.
    const head = args[5];
    if (!/^[0-9a-f]{40}$/.test(String(head))) { console.error("The reviewed head SHA is invalid."); return 1; }
    const r = await loadFacts(args[0], args[1], args[2], args[3], args[4]);
    if (!r.ok) { for (const reason of r.reasons) console.error(reason); return 1; }
    const facts = { ...r.facts, head };
    await writeFile(args[6], JSON.stringify({ facts, currentHead: r.facts.head }));
    console.log(r.facts.head === head ? "bound to the current head" : "bound to the reviewed head; the PR head has moved");
    return 0;
  }
  if (cmd === "comment") {
    const { facts } = JSON.parse(await readFile(args[1], "utf8")) as { facts: ReviewFacts };
    const r = await readArtifact(args[0]);
    if (!r.ok) {
      await writeFile(args[4], JSON.stringify({ body: failureComment(facts, r.reason, args[3]) }));
      await writeFile(args[5], JSON.stringify({ ok: false, reason: r.reason }));
      console.error(r.reason);
      return 3;
    }
    await writeFile(args[4], JSON.stringify({ body: buildComment(facts, r.verdict, r.body, { runUrl: args[3], currentHead: args[2] }) }));
    await writeFile(args[5], JSON.stringify({ ok: true, ...r.verdict }));
    console.log(`review ready: ${r.verdict.verdict}, ${r.verdict.findings} findings`);
    return 0;
  }
  if (cmd === "check-run") {
    const { facts } = JSON.parse(await readFile(args[0], "utf8")) as { facts: ReviewFacts };
    const v = JSON.parse(await readFile(args[1], "utf8")) as { ok: boolean; verdict?: VerdictKind; findings?: number; reason?: string };
    const verdict = v.ok ? { verdict: v.verdict!, findings: v.findings! } : null;
    await writeFile(args[4], JSON.stringify(buildCheckRun(facts, verdict, Number(args[2]), args[3], v.reason ?? "")));
    return 0;
  }
  console.error("Usage: agent-review.ts facts|config-touched|scan|bind|comment|check-run ...");
  return 2;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) process.exit(await main(process.argv.slice(2)));
