import "server-only";
import { readdir, readFile, stat } from "node:fs/promises";
import { join, sep } from "node:path";
import { homedir } from "node:os";

// Skills root resolution:
// 1. YIELDE_SKILLS_ROOT env var if set
// 2. ~/.claude/skills (the canonical path Claude Code uses, where we junctioned yielde/)
// 3. Fallback: ../yielde-skills/skills relative to this repo
export function skillsRoot(): string {
  if (process.env.YIELDE_SKILLS_ROOT) return process.env.YIELDE_SKILLS_ROOT;
  return join(homedir(), ".claude", "skills");
}

export type SkillFrontmatter = {
  name: string;
  description: string;
  version?: string;
  author?: string;
  license?: string;
  platforms?: string[];
  tags?: string[];
  related_skills?: string[];
  requires_tools?: string[];
  requires_capabilities?: string[];
  provenance?: "yielde-native" | "hermes-import" | "auto-generated" | string;
  pinned?: boolean;
  when_to_use?: string;
  when_not_to_use?: string;
};

export type Skill = {
  category: string;
  name: string;
  path: string;
  frontmatter: SkillFrontmatter;
  body: string;
};

export type SkillSummary = {
  category: string;
  name: string;
  description: string;
  provenance: string;
  pinned: boolean;
  version: string;
  uses?: number;
  lastUsed?: string | null;
};

/** Naive but durable YAML frontmatter parser — handles strings, ints, bools, flat arrays, and `|` blocks. */
export function parseFrontmatter(src: string): { fm: SkillFrontmatter; body: string } {
  const m = src.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!m) {
    return { fm: { name: "unknown", description: "" }, body: src };
  }
  const yaml = m[1];
  const body = m[2];

  // Tokenise by top-level keys: a key starts at column 0 with `key:`
  const lines = yaml.split(/\r?\n/);
  const out: Record<string, unknown> = {};
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) { i++; continue; }
    const kv = line.match(/^([a-zA-Z_][a-zA-Z0-9_]*):\s*(.*)$/);
    if (!kv) { i++; continue; }
    const key = kv[1];
    let val: string = kv[2];

    if (val === "|" || val === ">" || val === "|-" || val === ">-") {
      // Multi-line block — read until dedent
      i++;
      const block: string[] = [];
      while (i < lines.length && (lines[i].startsWith("  ") || lines[i].trim() === "")) {
        block.push(lines[i].replace(/^  /, ""));
        i++;
      }
      out[key] = block.join("\n").trim();
      continue;
    }

    if (val.startsWith("[") && val.endsWith("]")) {
      // Flow array
      out[key] = val
        .slice(1, -1)
        .split(",")
        .map((s) => s.trim().replace(/^["']|["']$/g, ""))
        .filter(Boolean);
      i++;
      continue;
    }

    // Strip quotes
    val = val.replace(/^["']|["']$/g, "");

    if (val === "true") out[key] = true;
    else if (val === "false") out[key] = false;
    else if (/^-?\d+$/.test(val)) out[key] = parseInt(val, 10);
    else out[key] = val;

    i++;
  }

  return { fm: out as SkillFrontmatter, body };
}

async function* walkSkills(root: string): AsyncGenerator<{ category: string; name: string; path: string }> {
  let categories: string[];
  try {
    categories = await readdir(root);
  } catch {
    return;
  }

  for (const category of categories) {
    if (category.startsWith(".") || category === "INDEX.md") continue;
    const catPath = join(root, category);
    let st;
    try { st = await stat(catPath); } catch { continue; }
    if (!st.isDirectory()) continue;

    let names: string[];
    try { names = await readdir(catPath); } catch { continue; }
    for (const name of names) {
      if (name.startsWith(".")) continue;
      const skillDir = join(catPath, name);
      let skillStat;
      try { skillStat = await stat(skillDir); } catch { continue; }
      if (!skillStat.isDirectory()) continue;
      const skillFile = join(skillDir, "SKILL.md");
      try { await stat(skillFile); } catch { continue; }
      yield { category, name, path: skillFile };
    }
  }
}

export async function listSkills(opts?: { category?: string }): Promise<SkillSummary[]> {
  const root = skillsRoot();
  const out: SkillSummary[] = [];

  // Try to read usage telemetry sidecar
  let usage: Record<string, { uses?: number; last_used?: string }> = {};
  try {
    const usageRaw = await readFile(join(root, ".usage.json"), "utf8");
    const parsed = JSON.parse(usageRaw);
    usage = parsed.skills || {};
  } catch {
    // OK — no telemetry yet
  }

  for await (const entry of walkSkills(root)) {
    if (opts?.category && entry.category !== opts.category) continue;
    const src = await readFile(entry.path, "utf8");
    const { fm } = parseFrontmatter(src);
    out.push({
      category: entry.category,
      name: fm.name || entry.name,
      description: fm.description || "",
      provenance: (fm.provenance as string) || "unknown",
      pinned: fm.pinned === true,
      version: (fm.version as string) || "0.0.0",
      uses: usage[fm.name]?.uses ?? 0,
      lastUsed: usage[fm.name]?.last_used ?? null,
    });
  }

  out.sort((a, b) => {
    if (a.category !== b.category) return a.category.localeCompare(b.category);
    return a.name.localeCompare(b.name);
  });

  return out;
}

export async function readSkill(category: string, name: string): Promise<Skill | null> {
  const root = skillsRoot();
  const path = join(root, category, name, "SKILL.md");
  let src: string;
  try {
    src = await readFile(path, "utf8");
  } catch {
    return null;
  }
  const { fm, body } = parseFrontmatter(src);
  return {
    category,
    name: fm.name || name,
    path,
    frontmatter: fm,
    body,
  };
}
