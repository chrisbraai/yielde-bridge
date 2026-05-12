import "server-only";
import { readdir, readFile, stat } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { homedir } from "node:os";
import { parseFrontmatter } from "./skills";

// Yielde-skills `_pending/<name>/SKILL.md` holds bulk-imported Hermes drafts
// awaiting Chris's `--operator chris` promote (Phase 7 deliverable 6d).
// Bridge surfaces them read-only — Chris promotes by running the CLI directly,
// never by clicking a button in the UI.

export type HermesPendingDraft = {
  name: string;
  path: string;
  modifiedAt: string;
  description: string;
  importedFrom: string | null;
  importedAt: string | null;
  tags: string[];
  shadowsExistingLive: boolean;
  bodyPreview: string;
};

type FmShape = {
  name?: string;
  description?: string;
  tags?: string[] | string;
  imported_from?: string;
  imported_at?: string;
};

function hermesPendingRoot(): string {
  if (process.env.YIELDE_HERMES_PENDING_ROOT) return process.env.YIELDE_HERMES_PENDING_ROOT;
  return join(homedir(), "yielde-skills", "_pending");
}

function hermesLiveRoot(): string {
  return join(dirname(hermesPendingRoot()), "skills", "hermes");
}

function asTags(raw: FmShape["tags"]): string[] {
  if (Array.isArray(raw)) return raw;
  if (typeof raw === "string") {
    return raw
      .replace(/^\[|\]$/g, "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
  }
  return [];
}

function buildPreview(body: string): string {
  const stripped = body
    .replace(/^---[\s\S]*?---\s*/m, "")
    .replace(/^\s*#+\s+.*$/gm, "")
    .replace(/\s+/g, " ")
    .trim();
  if (stripped.length <= 280) return stripped;
  return stripped.slice(0, 277) + "…";
}

export async function listHermesPendingDrafts(): Promise<HermesPendingDraft[]> {
  const root = hermesPendingRoot();
  const liveRoot = hermesLiveRoot();
  let entries: string[];
  try {
    entries = await readdir(root);
  } catch {
    return [];
  }
  const drafts: HermesPendingDraft[] = [];
  for (const entry of entries) {
    if (entry.startsWith(".")) continue;
    const dir = join(root, entry);
    let st;
    try { st = await stat(dir); } catch { continue; }
    if (!st.isDirectory()) continue;
    const skillFile = join(dir, "SKILL.md");
    let fileSt;
    try { fileSt = await stat(skillFile); } catch { continue; }
    if (!fileSt.isFile()) continue;
    let raw: string;
    try {
      raw = await readFile(skillFile, "utf8");
    } catch {
      continue;
    }
    const { fm, body } = parseFrontmatter(raw);
    const fmt = fm as unknown as FmShape;
    const name = fmt.name ?? entry;
    drafts.push({
      name,
      path: skillFile,
      modifiedAt: fileSt.mtime.toISOString(),
      description: fmt.description ?? "",
      importedFrom: fmt.imported_from ?? null,
      importedAt: fmt.imported_at ?? null,
      tags: asTags(fmt.tags),
      shadowsExistingLive: existsSync(join(liveRoot, name, "SKILL.md")),
      bodyPreview: buildPreview(body),
    });
  }
  drafts.sort((a, b) => b.modifiedAt.localeCompare(a.modifiedAt));
  return drafts;
}
