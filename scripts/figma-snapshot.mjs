#!/usr/bin/env node
// Read-only snapshot of the design file for agents that cannot use the Figma MCP server (the agent pipeline).
// Fetches the top-level frames of the pages Foundations, Components and Screens through Figma's REST API and writes
// them to a folder: `index.json`, one PNG and one node tree (JSON) per frame. It runs as a pipeline step before the
// agent starts, with the read-only token in that step only; the agent reads the files and never sees the token.
// No dependencies (Node 22). Design and setup: docs/agents/adding-an-agent.md, "Figma in the pipeline".
import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

export const PAGES = ["Foundations", "Components", "Screens"];
const FRAME_TYPES = new Set(["FRAME", "COMPONENT", "COMPONENT_SET", "SECTION"]);
const CHUNK = 20; // node ids per request, to keep URLs and responses small
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;

export function fileKeyFrom(value) {
  const m = /figma\.com\/(?:design|file)\/([A-Za-z0-9]{10,40})(?:[/?#]|$)/.exec(String(value ?? ""));
  if (!m) throw new Error("FIGMA_FILE_URL must be a figma.com/design/<file key>/… URL.");
  return m[1];
}

// File-system safe name: lowercase letters, digits and dashes only.
export function safeName(text) {
  return String(text).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60) || "frame";
}

export function pickFrames(fileJson, pages = PAGES) {
  const frames = [];
  for (const page of fileJson?.document?.children ?? []) {
    if (!pages.includes(page.name)) continue;
    for (const node of page.children ?? []) {
      if (FRAME_TYPES.has(node.type)) frames.push({ id: node.id, name: node.name, page: page.name });
    }
  }
  return frames;
}

async function api(path, { token, base, fetchImpl }) {
  const res = await fetchImpl(`${base}${path}`, { headers: { "X-Figma-Token": token } });
  if (!res.ok) {
    // Status and Figma's own message only: never the request headers.
    let detail = "";
    try { const j = await res.json(); detail = j.err ?? j.message ?? ""; } catch { /* no body */ }
    const retry = res.headers.get("retry-after");
    throw new Error(`Figma API ${res.status} on ${path.split("?")[0]}${detail ? `: ${String(detail).slice(0, 120)}` : ""}${retry ? ` (retry after ${retry}s)` : ""}`);
  }
  return res.json();
}

export async function snapshot({ token, fileKey, outDir, base = "https://api.figma.com", fetchImpl = fetch, maxFrames = 40, scale = 1 }) {
  if (!token) throw new Error("FIGMA_TOKEN is not set.");
  const ctx = { token, base, fetchImpl };
  const file = await api(`/v1/files/${fileKey}?depth=2`, ctx);
  const frames = pickFrames(file).slice(0, maxFrames);
  if (frames.length === 0) throw new Error(`No frames found on the pages ${PAGES.join(", ")}.`);

  await mkdir(join(outDir, "frames"), { recursive: true });
  await mkdir(join(outDir, "nodes"), { recursive: true });

  const out = [];
  for (let i = 0; i < frames.length; i += CHUNK) {
    const chunk = frames.slice(i, i + CHUNK);
    const ids = chunk.map((f) => f.id).join(",");
    const nodes = await api(`/v1/files/${fileKey}/nodes?ids=${encodeURIComponent(ids)}`, ctx);
    const images = await api(`/v1/images/${fileKey}?ids=${encodeURIComponent(ids)}&format=png&scale=${scale}`, ctx);
    for (const f of chunk) {
      const base1 = `${safeName(f.page)}-${safeName(f.name)}-${safeName(f.id)}`;
      const entry = { id: f.id, name: f.name, page: f.page, json: null, png: null };
      const node = nodes?.nodes?.[f.id]?.document;
      if (node) {
        entry.json = `nodes/${base1}.json`;
        await writeFile(join(outDir, entry.json), JSON.stringify(node, null, 2));
      }
      const url = images?.images?.[f.id];
      if (url) {
        const u = new URL(url);
        if (u.protocol !== "https:" && u.origin !== new URL(base).origin) throw new Error("Refusing a non-HTTPS image URL.");
        const res = await fetchImpl(url); // the image host needs no token, so none is sent
        if (!res.ok) throw new Error(`Image download failed with ${res.status} for ${f.name}.`);
        const buf = Buffer.from(await res.arrayBuffer());
        if (buf.length > MAX_IMAGE_BYTES) throw new Error(`Image of ${f.name} is larger than ${MAX_IMAGE_BYTES} bytes.`);
        entry.png = `frames/${base1}.png`;
        await writeFile(join(outDir, entry.png), buf);
      }
      out.push(entry);
    }
  }

  const index = {
    note: "Read-only snapshot taken by the pipeline from Figma's REST API. Variable names are not included; tokens are in docs/specs/design.md and src/styles/global.css. Frames are not editable from here.",
    takenAt: new Date().toISOString(),
    file: { name: file.name, version: file.version, lastModified: file.lastModified },
    frames: out,
  };
  await writeFile(join(outDir, "index.json"), JSON.stringify(index, null, 2));
  return { frames: out.length, withImages: out.filter((e) => e.png).length };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    const outDir = process.argv[2];
    if (!outDir) throw new Error("Usage: figma-snapshot.mjs <output folder>");
    const r = await snapshot({ token: process.env.FIGMA_TOKEN, fileKey: fileKeyFrom(process.env.FIGMA_FILE_URL), outDir });
    console.log(`Snapshot written to ${outDir}: ${r.frames} frames, ${r.withImages} images.`);
  } catch (e) {
    console.error(e.message);
    process.exit(1);
  }
}
