import "server-only";
import { readdir, readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import { homedir } from "node:os";
import { parseFrontmatter } from "./skills";

// Yielde brain `_inbox/` holds draft entries that Chris (and only Chris) promotes via `/brain-log promote`.
// Bridge surfaces them read-only — never writes here, never moves them out of _inbox/.

export type BrainDraftKind =
  | "decision"
  | "incident"
  | "staff-work"
  | "sop-update"
  | "client-update"
  | "unknown";

export type BrainDraft = {
  filename: string;
  path: string;
  modifiedAt: string;
  kind: BrainDraftKind;
  date: string | null;
  author: string | null;
  status: string | null;
  promoteTarget: string | null;
  tags: string[];
  session: string | null;
  title: string;
  body: string;
  preview: string;
};

type BrainFrontmatter = {
  kind?: string;
  date?: string;
  author?: string;
  status?: string;
  promote_target?: string;
  tags?: string[] | string;
  session?: string;
};

export function brainRoot(): string {
  if (process.env.YIELDE_BRAIN_ROOT) return process.env.YIELDE_BRAIN_ROOT;
  return join(homedir(), "yielde-brain");
}

export function brainInboxRoot(): string {
  return join(brainRoot(), "_inbox");
}

function asKind(raw: string | undefined): BrainDraftKind {
  switch (raw) {
    case "decision":
    case "incident":
    case "staff-work":
    case "sop-update":
    case "client-update":
      return raw;
    default:
      return "unknown";
  }
}

function asTags(raw: BrainFrontmatter["tags"]): string[] {
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

function deriveTitle(filename: string, body: string): string {
  const m = body.match(/^\s*#\s+(.+)\s*$/m);
  if (m) return m[1]!.trim();
  return filename.replace(/\.md$/i, "");
}

function buildPreview(body: string): string {
  const stripped = body
    .replace(/^\s*#+\s+.*$/gm, "")
    .replace(/^\s*[-*]\s+/gm, "")
    .replace(/\s+/g, " ")
    .trim();
  if (stripped.length <= 220) return stripped;
  return stripped.slice(0, 217) + "…";
}

export async function listBrainInboxDrafts(): Promise<BrainDraft[]> {
  const root = brainInboxRoot();
  let entries: string[];
  try {
    entries = await readdir(root);
  } catch {
    return [];
  }
  const drafts: BrainDraft[] = [];
  for (const entry of entries) {
    if (!entry.toLowerCase().endsWith(".md")) continue;
    if (entry.toUpperCase() === "README.MD") continue;
    const path = join(root, entry);
    let st;
    try {
      st = await stat(path);
    } catch {
      continue;
    }
    if (!st.isFile()) continue;
    let raw: string;
    try {
      raw = await readFile(path, "utf8");
    } catch {
      continue;
    }
    const { fm, body } = parseFrontmatter(raw);
    const fmt = fm as unknown as BrainFrontmatter;
    drafts.push({
      filename: entry,
      path,
      modifiedAt: st.mtime.toISOString(),
      kind: asKind(fmt.kind),
      date: fmt.date ?? null,
      author: fmt.author ?? null,
      status: fmt.status ?? null,
      promoteTarget: fmt.promote_target ?? null,
      tags: asTags(fmt.tags),
      session: fmt.session ?? null,
      title: deriveTitle(entry, body),
      body,
      preview: buildPreview(body),
    });
  }
  drafts.sort((a, b) => b.modifiedAt.localeCompare(a.modifiedAt));
  return drafts;
}

export async function readBrainDraft(filename: string): Promise<BrainDraft | null> {
  const safe = filename.replace(/[\\/]/g, "");
  if (!safe || safe.startsWith(".") || !safe.toLowerCase().endsWith(".md")) return null;
  const drafts = await listBrainInboxDrafts();
  return drafts.find((d) => d.filename === safe) ?? null;
}
