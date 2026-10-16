#!/usr/bin/env node
// Publishes the stage status and the marked decisions and log entries of docs/PLAN.md to one Notion page.
// Only entries ending with `<!-- notion -->` are published (allowlist); the page may be public.
// One-way: the repository is the source of truth and the page is overwritten on every run.
// No dependencies (Node 22). Runs only from `.github/workflows/notion-sync.yml` on `main`,
// or by hand with DRY_RUN=1 to print the blocks without calling Notion.
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const NOTION_VERSION = "2022-06-28";
const MAX_TEXT = 2000; // Notion limit per rich-text item
const MAX_BATCH = 100; // Notion limit of blocks per append call
const MARKER = /\s*<!--\s*notion\s*-->\s*$/;

// Content that must never be published to a page that may be public.
const FORBIDDEN = [
  [/claude\.ai\/code\/session_/i, "session link"],
  [/\b(?:secret_|ntn_)[A-Za-z0-9]{20,}/, "Notion token"],
  [/\b(?:gh[pousr]_|github_pat_)[A-Za-z0-9_]{20,}/, "GitHub token"],
  [/[\w.+-]+@[\w-]+\.[\w.-]+/, "email address"],
];

export function pageIdFrom(value) {
  const m = String(value ?? "").replace(/-/g, "").match(/[0-9a-f]{32}(?![0-9a-f])/i);
  if (!m) throw new Error("NOTION_PAGE_ID must be a Notion page ID or URL (32 hex characters).");
  return m[0].toLowerCase();
}

export function sections(markdown) {
  const out = {};
  let name = null;
  for (const line of markdown.split("\n")) {
    const h = line.match(/^## (.+)$/);
    if (h) { name = h[1].trim(); out[name] = []; continue; }
    if (name) out[name].push(line);
  }
  return out;
}

// `[text](https://…)` keeps absolute links; relative repo links become plain text.
export function richText(text) {
  const items = [];
  const re = /\[([^\]]+)\]\(([^)]+)\)|`([^`]+)`|\*\*([^*]+)\*\*/g;
  let last = 0, m;
  const push = (content, extra = {}) => {
    for (let i = 0; i < content.length; i += MAX_TEXT) {
      items.push({ type: "text", text: { content: content.slice(i, i + MAX_TEXT), ...(extra.link ? { link: { url: extra.link } } : {}) }, ...(extra.annotations ? { annotations: extra.annotations } : {}) });
    }
  };
  while ((m = re.exec(text))) {
    if (m.index > last) push(text.slice(last, m.index));
    if (m[1] !== undefined) push(m[1], /^https:\/\//.test(m[2]) ? { link: m[2] } : {});
    else if (m[3] !== undefined) push(m[3], { annotations: { code: true } });
    else push(m[4], { annotations: { bold: true } });
    last = re.lastIndex;
  }
  if (last < text.length) push(text.slice(last));
  return items.length ? items : [{ type: "text", text: { content: " " } }];
}

const heading = (t) => ({ object: "block", type: "heading_2", heading_2: { rich_text: richText(t) } });
const bullet = (t) => ({ object: "block", type: "bulleted_list_item", bulleted_list_item: { rich_text: richText(t) } });
const paragraph = (t) => ({ object: "block", type: "paragraph", paragraph: { rich_text: richText(t) } });

function stageLines(lines) {
  const out = [];
  for (const line of lines) {
    if (!line.startsWith("|")) continue;
    const c = line.split("|").slice(1, -1).map((s) => s.trim());
    if (c.length < 6 || !/^\d\d$/.test(c[0])) continue;
    const pr = c[5] ? ` — ${c[5]}` : "";
    out.push(`**Stage ${c[0]}** ${c[1].replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")} — ${c[4]}${pr}`);
  }
  return out;
}

export function buildBlocks(markdown, sha = "") {
  const s = sections(markdown);
  // Allowlist: only entries that end with the marker are published. Everything else stays in the repository.
  const bullets = (lines) => lines.filter((l) => l.startsWith("- ") && MARKER.test(l)).map((l) => bullet(l.slice(2).replace(MARKER, "")));
  const blocks = [
    paragraph(`Synced from \`docs/PLAN.md\` in the repository${sha ? ` (commit ${sha.slice(0, 7)})` : ""}. Do not edit this page: it is overwritten on every sync.`),
    heading("Stages"), ...stageLines(markdown.split("\n")).map(bullet),
    heading("Decisions"), ...bullets(s["Decisions"] ?? []),
    heading("Log"), ...bullets(s["Log"] ?? []),
  ];
  // Check the serialized blocks (link URLs included) and each block's text joined, because a value can be split across rich-text items.
  const texts = blocks.map((b) => b[b.type].rich_text.map((r) => r.text.content).join(""));
  for (const text of [JSON.stringify(blocks), ...texts]) {
    for (const [re, what] of FORBIDDEN) if (re.test(text)) throw new Error(`Refusing to publish: content looks like it contains a ${what}.`);
  }
  return blocks;
}

async function api(base, token, method, path, body) {
  for (let attempt = 0; attempt < 5; attempt++) {
    const res = await fetch(`${base}${path}`, {
      method,
      headers: { Authorization: `Bearer ${token}`, "Notion-Version": NOTION_VERSION, "Content-Type": "application/json" },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (res.status === 429) { await new Promise((r) => setTimeout(r, Number(res.headers.get("retry-after") ?? 1) * 1000)); continue; }
    if (!res.ok) throw new Error(`Notion ${method} ${path} failed: ${res.status} ${(await res.text()).slice(0, 200)}`);
    return res.json();
  }
  throw new Error(`Notion ${method} ${path} kept returning 429.`);
}

export async function sync({ token, pageId, blocks, base = "https://api.notion.com" }) {
  const old = [];
  let cursor;
  do {
    const r = await api(base, token, "GET", `/v1/blocks/${pageId}/children?page_size=100${cursor ? `&start_cursor=${cursor}` : ""}`);
    old.push(...r.results.map((b) => b.id));
    cursor = r.has_more ? r.next_cursor : undefined;
  } while (cursor);
  // Append first, delete after, so a failure never leaves the page empty.
  for (let i = 0; i < blocks.length; i += MAX_BATCH) {
    await api(base, token, "PATCH", `/v1/blocks/${pageId}/children`, { children: blocks.slice(i, i + MAX_BATCH) });
  }
  for (const id of old) await api(base, token, "DELETE", `/v1/blocks/${id}`);
  return { added: blocks.length, removed: old.length };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const markdown = await readFile(new URL("../docs/PLAN.md", import.meta.url), "utf8");
  const blocks = buildBlocks(markdown, process.env.GITHUB_SHA ?? "");
  if (process.env.DRY_RUN) {
    console.log(JSON.stringify(blocks, null, 2));
  } else {
    if (!process.env.NOTION_TOKEN) throw new Error("NOTION_TOKEN is not set.");
    const result = await sync({ token: process.env.NOTION_TOKEN, pageId: pageIdFrom(process.env.NOTION_PAGE_ID), blocks });
    console.log(`Notion page updated: ${result.added} blocks added, ${result.removed} removed.`);
  }
}
