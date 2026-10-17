// Checks that the agent-run workflow applies before it lets an agent's result leave the runner.
// Pure functions, no dependencies (Node 22). Design: docs/MULTI-AGENT-PHASES.md, "Phase 2".
// The workflow calls the CLI at the bottom; the unit tests live in agent-checks.test.mjs.
import { readFile, writeFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { parseStages } from "./next-stage-issue.mjs";

// Who may start a run. The trusted login is a repository variable, never derived from the repository owner.
export function isTrusted(actor, trustedLogin) {
  if (typeof actor !== "string" || typeof trustedLogin !== "string") return false;
  const trusted = trustedLogin.trim().toLowerCase();
  return trusted !== "" && actor.trim().toLowerCase() === trusted;
}

// The issue title is data: only this exact shape is accepted, and only the two digits are used.
export function parseWorkOrderTitle(title) {
  const m = /^Run Stage ([0-9]{2}):/.exec(String(title ?? ""));
  return m ? m[1] : null;
}

// The only refs a run may push to: agent/stage-NN-<slug> for the validated stage number.
export function validateDestRef(ref, stage) {
  if (!/^[0-9]{2}$/.test(String(stage))) return false;
  const m = /^agent\/stage-([0-9]{2})-[a-z0-9][a-z0-9-]{0,40}$/.exec(String(ref ?? ""));
  return m !== null && m[1] === String(stage);
}

// Scanner configuration files that AGENTS.md describes only in words ("scanner configs").
export const SCANNER_CONFIGS = [".gitleaks.toml", ".gitleaks.yml", ".gitleaksignore", ".trivyignore", ".semgrepignore", ".zap/**"];

// Reads the protected paths from the "Protected paths" line of AGENTS.md on main, so a change there changes the check.
export function parseProtectedPaths(agentsMd) {
  const line = String(agentsMd).split("\n").find((l) => l.includes("**Protected paths:**"));
  if (!line) throw new Error("AGENTS.md has no 'Protected paths' line.");
  const items = [...line.matchAll(/`([^`]+)`/g)].map((m) => m[1]);
  if (items.length === 0) throw new Error("The 'Protected paths' line of AGENTS.md lists no paths.");
  return [...new Set([...items, ...SCANNER_CONFIGS])];
}

export function matchesProtected(file, patterns) {
  const f = String(file).replace(/^\.\//, "");
  return patterns.some((p) => (p.endsWith("/**") ? f.startsWith(p.slice(0, -2)) : f === p));
}

export function protectedTouched(files, patterns) {
  return files.filter((f) => matchesProtected(f, patterns));
}

// Path lists come from `git diff --no-renames --name-only -z`: NUL-separated, never quoted, with both sides of a rename.
export function parsePathList(text) {
  return String(text ?? "").split("\0").filter(Boolean);
}

// Scans every new commit and blob (binary ones too, merge resolutions included), not only the text of a patch.
// `batch` is the output of `git cat-file --batch` for the objects of `git rev-list --objects <base>..<branch>`.
export function scanObjectBatch(batch) {
  const found = new Set();
  let i = 0;
  while (i < batch.length) {
    const nl = batch.indexOf(10, i);
    if (nl === -1) break;
    const [, type, size] = batch.subarray(i, nl).toString("latin1").split(" ");
    const len = Number(size);
    if (!Number.isInteger(len)) throw new Error("Unreadable output of git cat-file --batch.");
    if (type === "blob" || type === "commit" || type === "tag") for (const name of findSecrets(batch.subarray(nl + 1, nl + 1 + len).toString("latin1"))) found.add(name);
    i = nl + 1 + len + 1;
  }
  return [...found];
}

export function scanRange(base, branch, cwd = process.cwd()) {
  const git = (args, input) => execFileSync("git", args, { cwd, input, maxBuffer: 1 << 30 });
  const ids = git(["rev-list", "--objects", "--no-object-names", `${base}..${branch}`]);
  return scanObjectBatch(git(["cat-file", "--batch"], ids));
}

// The agent may ask for a draft (a blocked run, AGENTS.md rule 8). The reason is data: one short line.
export function cleanDraftReason(text) {
  return String(text ?? "").replace(/\s+/g, " ").trim().slice(0, 500);
}

export function finalizePublication(decision, requestedReason) {
  const reason = cleanDraftReason(requestedReason);
  const lines = [];
  if (decision.action === "draft") lines.push(decision.reason);
  if (reason) lines.push(`The agent asked for a draft: ${reason}`);
  return { draft: lines.length > 0, warning: lines.join(" ") };
}

// Workflow files are a separate outcome: the App has no Workflows permission, so the run is rejected, not drafted.
export function touchesWorkflows(files) {
  return files.some((f) => String(f).replace(/^\.\//, "").startsWith(".github/workflows/"));
}

// Names of the kinds of secret found, never the matched text, so the report cannot leak the value.
const SECRET_PATTERNS = [
  ["OpenAI-style API key", /\bsk-(?!ant-)(?:proj-|svcacct-|admin-)?[A-Za-z0-9_-]{20,}/],
  ["Anthropic API key", /\bsk-ant-[A-Za-z0-9_-]{20,}/],
  ["GitHub token", /\b(?:gh[pousr]_[A-Za-z0-9]{36,}|github_pat_[A-Za-z0-9_]{50,})/],
  ["Google API key", /\bAIza[0-9A-Za-z_-]{35}\b/],
  ["private key", /-----BEGIN [A-Z ]*PRIVATE KEY-----/],
  ["session link", /claude\.ai\/code\/session_|chatgpt\.com\/codex\/tasks\//],
];

export function findSecrets(text) {
  const s = String(text ?? "");
  return SECRET_PATTERNS.filter(([, re]) => re.test(s)).map(([name]) => name);
}

// agents/registry.yaml is a flat list of entries with scalar values and inline lists, so no YAML library is needed.
export function parseRegistry(yaml) {
  const agents = [];
  let cur = null;
  for (const raw of String(yaml).split("\n")) {
    const line = raw.replace(/\s+#.*$/, "").trimEnd();
    if (line.trim() === "" || line.trim().startsWith("#")) continue;
    const start = /^- (\w+):\s*(.*)$/.exec(line);
    const field = /^\s+(\w+):\s*(.*)$/.exec(line);
    const m = start ?? field;
    if (!m) throw new Error(`Unreadable line in agents/registry.yaml: ${line}`);
    if (start) { cur = {}; agents.push(cur); }
    if (!cur) throw new Error("agents/registry.yaml must start with a '- id:' entry.");
    const v = m[2].trim();
    cur[m[1]] = v.startsWith("[") ? v.slice(1, -1).split(",").map((x) => x.trim()).filter(Boolean) : v.replace(/^["']|["']$/g, "");
  }
  for (const a of agents) {
    for (const k of ["id", "key_secret", "runner", "capabilities"]) if (a[k] === undefined) throw new Error(`Agent ${a.id ?? "?"} has no "${k}" in agents/registry.yaml.`);
    if (!/^[a-z0-9-]{1,30}$/.test(a.id)) throw new Error(`Agent id "${a.id}" is not a short lowercase slug.`);
    // A registry entry can never point the work job at the App key or any other secret.
    if (!/^AGENT_KEY_[A-Z0-9_]{1,40}$/.test(a.key_secret)) throw new Error(`key_secret "${a.key_secret}" of agent ${a.id} must look like AGENT_KEY_<ID>.`);
  }
  return agents;
}

export function missingCapabilities(needs, capabilities) {
  return needs.filter((n) => !capabilities.includes(n));
}

// Rule 3 of AGENTS.md: a stage PR is an open PR from a branch of this repository whose title starts with "Stage ".
// `prs` is the JSON of `gh pr list --state open --json title,isCrossRepository`.
export function hasOpenStagePr(prs) {
  return prs.some((p) => p.isCrossRepository === false && String(p.title).startsWith("Stage "));
}

// Rule 1 of AGENTS.md: take only the next pending stage.
export function nextPendingStage(planMd) {
  return parseStages(planMd).find((s) => s.status === "pending") ?? null;
}

export const PR_BODY_HEADINGS = [
  "## What was done",
  "## Acceptance criteria",
  "## What to review",
  "## Spec changes",
  "## Security-relevant changes",
  "## Next stage spec",
  "## Decisions made and why",
  "## Pending items or risks",
];

// Returns a list of problems; empty means the PR text can be published.
export function validatePrText(title, body, stage) {
  const problems = [];
  if (!String(title ?? "").startsWith(`Stage ${stage}:`)) problems.push(`The PR title must start with "Stage ${stage}:".`);
  const text = String(body ?? "");
  if (text.trim() === "") problems.push("The PR body is empty.");
  for (const h of PR_BODY_HEADINGS) if (!text.includes(h)) problems.push(`The PR body is missing the section "${h}".`);
  return problems;
}

// The follow-up commit of AGENTS.md rule 4 may only add the PR link to the stage row and its log line.
// `diff` is the output of `git diff -U0 <before> <after>`.
export function checkPlanFollowUp(diff, prNumber) {
  const files = [...String(diff).matchAll(/^diff --git a\/(\S+) b\//gm)].map((m) => m[1]);
  if (files.length !== 1 || files[0] !== "docs/PLAN.md") return { ok: false, reason: "The follow-up commit must change only docs/PLAN.md." };
  const body = String(diff).split("\n").filter((l) => !l.startsWith("+++") && !l.startsWith("---"));
  const added = body.filter((l) => l.startsWith("+")).map((l) => l.slice(1));
  const removed = body.filter((l) => l.startsWith("-")).map((l) => l.slice(1));
  if (added.length !== removed.length || added.length === 0 || added.length > 2) return { ok: false, reason: "The follow-up commit must change one or two lines of docs/PLAN.md." };
  const link = new RegExp(`#${Number(prNumber)}(?![0-9])`);
  for (const a of added) if (!link.test(a)) return { ok: false, reason: `Every changed line must carry the link to PR #${Number(prNumber)}.` };
  return { ok: true };
}

// Adds the PR link to the stage's row (PR column) and to its log line in docs/PLAN.md, as AGENTS.md rule 4 asks.
// Only these two lines change; anything it cannot place is left alone and reported by checkPlanFollowUp.
export function linkPlan(planMd, stage, prNumber) {
  const link = `#${Number(prNumber)}`;
  const lines = String(planMd).split("\n");
  // A log entry of this stage: "- <date> — Stage NN — ..." that has no PR link yet. Other entries may mention the stage.
  const own = new RegExp(`^- [0-9]{4}-[0-9]{2}-[0-9]{2} — Stage ${stage} — (?!PR #)`);
  let inLog = false;
  let lastEntry = -1;
  lines.forEach((line, i) => {
    if (/^## /.test(line)) inLog = /^## Log/.test(line);
    if (inLog && own.test(line)) lastEntry = i;
  });
  inLog = false;
  return lines.map((line, i) => {
    if (/^## /.test(line)) inLog = /^## Log/.test(line);
    if (!inLog && line.startsWith(`| ${stage} |`)) {
      const cells = line.split("|");
      // cells: "", number, stage, needs, spec, status, PR, issue, ""
      if (cells.length >= 9 && cells[6].trim() === "") { cells[6] = ` ${link} `; return cells.join("|"); }
      return line;
    }
    if (i === lastEntry) return line.replace(`Stage ${stage} — `, `Stage ${stage} — PR ${link} — `);
    return line;
  }).join("\n");
}

// Protected paths touched: draft with a warning. Workflow files or secrets: reject.
export function decidePublication({ files, patterns, texts }) {
  const secrets = findSecrets(texts.join("\n"));
  if (secrets.length > 0) return { action: "reject", reason: `Secret-like content found: ${secrets.join(", ")}.` };
  if (touchesWorkflows(files)) return { action: "reject", reason: "The run changed .github/workflows/**, which the App cannot push. Escalate to Hugo." };
  const protectedFiles = protectedTouched(files, patterns);
  if (protectedFiles.length > 0) return { action: "draft", reason: `Protected paths changed: ${protectedFiles.join(", ")}.`, protectedFiles };
  return { action: "publish" };
}

// CLI used by the workflow. Each command prints one line and exits non-zero on failure.
//   node scripts/agent-checks.mjs trusted <actor> <trustedLogin>
//   node scripts/agent-checks.mjs stage <issue title>
//   node scripts/agent-checks.mjs ref <ref> <stage>
//   node scripts/agent-checks.mjs open-stage-pr <json-file>
//   node scripts/agent-checks.mjs plan <PLAN.md> <registry.yaml> <stage> <agent-id>
//   node scripts/agent-checks.mjs pr-text <title-file> <body-file> <stage>
//   node scripts/agent-checks.mjs link-plan <PLAN.md> <stage> <pr>
//   node scripts/agent-checks.mjs check-follow-up <diff-file> <pr>
//   node scripts/agent-checks.mjs scan-range <base> <branch>
//   node scripts/agent-checks.mjs publish-plan <decision.json> <draft-reason-file> <warning-out>
//   node scripts/agent-checks.mjs decide <AGENTS.md> <NUL-separated-files-file> <text-file>...
async function main(argv) {
  const [cmd, ...args] = argv;
  if (cmd === "trusted") {
    const ok = isTrusted(args[0], args[1]);
    console.log(ok ? "trusted" : "not trusted");
    return ok ? 0 : 1;
  }
  if (cmd === "stage") {
    const n = parseWorkOrderTitle(args[0]);
    if (n) console.log(n);
    else console.error('The issue title must start with "Run Stage NN:".');
    return n ? 0 : 1;
  }
  if (cmd === "ref") {
    const ok = validateDestRef(args[0], args[1]);
    console.log(ok ? "ok" : "invalid ref");
    return ok ? 0 : 1;
  }
  if (cmd === "open-stage-pr") {
    // open-stage-pr <json-file>
    const open = hasOpenStagePr(JSON.parse(await readFile(args[0], "utf8")));
    console.log(open ? "a stage PR is open" : "no stage PR is open");
    return open ? 1 : 0;
  }
  if (cmd === "plan") {
    // plan <PLAN.md> <registry.yaml> <stage> <agent-id>  -> prints JSON {stage, name, agent}; fails if not allowed
    const stage = nextPendingStage(await readFile(args[0], "utf8"));
    if (!stage) { console.error("No pending stage in docs/PLAN.md."); return 1; }
    if (stage.number !== args[2]) { console.error(`Stage ${args[2]} is not the next pending stage (${stage.number} is).`); return 1; }
    const agent = parseRegistry(await readFile(args[1], "utf8")).find((a) => a.id === args[3]);
    if (!agent) { console.error(`Agent "${args[3]}" is not in agents/registry.yaml.`); return 1; }
    const missing = missingCapabilities(stage.needs, agent.capabilities);
    if (missing.length > 0) { console.error(`Agent ${agent.id} lacks: ${missing.join(", ")}.`); return 1; }
    console.log(JSON.stringify({ stage: stage.number, name: stage.name, agent: agent.id, runner: agent.runner, keySecret: agent.key_secret }));
    return 0;
  }
  if (cmd === "pr-text") {
    // pr-text <title-file> <body-file> <stage>
    const title = (await readFile(args[0], "utf8")).trim();
    const problems = validatePrText(title, await readFile(args[1], "utf8"), args[2]);
    for (const p of problems) console.error(p);
    return problems.length === 0 ? 0 : 1;
  }
  if (cmd === "link-plan") {
    // link-plan <PLAN.md> <stage> <pr>   rewrites the file in place
    const { writeFile } = await import("node:fs/promises");
    const before = await readFile(args[0], "utf8");
    await writeFile(args[0], linkPlan(before, args[1], args[2]));
    return 0;
  }
  if (cmd === "check-follow-up") {
    // check-follow-up <diff-file> <pr>
    const r = checkPlanFollowUp(await readFile(args[0], "utf8"), args[1]);
    console.log(r.ok ? "ok" : r.reason);
    return r.ok ? 0 : 1;
  }
  if (cmd === "scan-range") {
    // scan-range <base> <branch>   scans every new commit and blob; prints kinds of secret, never values
    const kinds = scanRange(args[0], args[1]);
    console.log(kinds.length ? `Secret-like content in the outgoing objects: ${kinds.join(", ")}.` : "clean");
    return kinds.length ? 1 : 0;
  }
  if (cmd === "publish-plan") {
    // publish-plan <decision.json> <draft-reason-file or ""> <warning-out>   prints "draft" or "ready"
    const decision = JSON.parse(await readFile(args[0], "utf8"));
    const requested = args[1] ? await readFile(args[1], "utf8").catch(() => "") : "";
    const r = finalizePublication(decision, requested);
    await writeFile(args[2], r.warning);
    console.log(r.draft ? "draft" : "ready");
    return 0;
  }
  if (cmd === "decide") {
    // decide <agents-md> <files-file> <text-file>...
    const patterns = parseProtectedPaths(await readFile(args[0], "utf8"));
    const files = parsePathList(await readFile(args[1], "utf8"));
    const texts = await Promise.all(args.slice(2).map((f) => readFile(f, "utf8")));
    const d = decidePublication({ files, patterns, texts });
    console.log(JSON.stringify(d));
    return d.action === "reject" ? 1 : 0;
  }
  console.error("Usage: agent-checks.mjs trusted|stage|ref|open-stage-pr|plan|pr-text|link-plan|check-follow-up|scan-range|publish-plan|decide ...");
  return 2;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) process.exit(await main(process.argv.slice(2)));
