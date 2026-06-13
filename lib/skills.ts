import "server-only";
import { readdir, readFile, stat } from "node:fs/promises";
import { join } from "node:path";
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
  history?: number[];
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

// Like walkSkills, but ALSO yields top-level skills laid out as `<root>/<name>/SKILL.md`
// (the standard Claude Code layout used by the ECC bundle of ~190 skills). Nested category
// dirs like `yielde/` and `hermes/` are still traversed at two levels.
async function* walkAllSkills(root: string): AsyncGenerator<{ category: string; name: string; path: string }> {
  let topEntries: string[];
  try {
    topEntries = await readdir(root);
  } catch {
    return;
  }

  for (const entry of topEntries) {
    if (entry.startsWith(".") || entry === "INDEX.md") continue;
    const entryPath = join(root, entry);
    let st;
    try { st = await stat(entryPath); } catch { continue; }
    if (!st.isDirectory()) continue;

    // Case 1: direct skill — has SKILL.md at this level
    const directSkill = join(entryPath, "SKILL.md");
    let hasDirect = false;
    try { await stat(directSkill); hasDirect = true; } catch {}
    if (hasDirect) {
      yield { category: "core", name: entry, path: directSkill };
      continue;
    }

    // Case 2: category dir — walk one level deeper
    let names: string[];
    try { names = await readdir(entryPath); } catch { continue; }
    for (const name of names) {
      if (name.startsWith(".")) continue;
      const skillDir = join(entryPath, name);
      let skillStat;
      try { skillStat = await stat(skillDir); } catch { continue; }
      if (!skillStat.isDirectory()) continue;
      const skillFile = join(skillDir, "SKILL.md");
      try { await stat(skillFile); } catch { continue; }
      yield { category: entry, name, path: skillFile };
    }
  }
}

export async function listSkills(opts?: { category?: string }): Promise<SkillSummary[]> {
  const root = skillsRoot();
  const out: SkillSummary[] = [];

  const { readUsage, historySeries } = await import("./usage");
  const usageFile = await readUsage();
  const usage = usageFile.skills;

  for await (const entry of walkSkills(root)) {
    if (opts?.category && entry.category !== opts.category) continue;
    const src = await readFile(entry.path, "utf8");
    const { fm } = parseFrontmatter(src);
    const skillName = fm.name || entry.name;
    const u = usage[skillName];
    out.push({
      category: entry.category,
      name: skillName,
      description: fm.description || "",
      provenance: (fm.provenance as string) || "unknown",
      pinned: fm.pinned === true,
      version: (fm.version as string) || "0.0.0",
      uses: u?.uses ?? 0,
      lastUsed: u?.last_used ?? null,
      history: historySeries(u),
    });
  }

  out.sort((a, b) => {
    if (a.category !== b.category) return a.category.localeCompare(b.category);
    return a.name.localeCompare(b.name);
  });

  return out;
}

/**
 * Like listSkills, but includes top-level skills laid out as `<root>/<name>/SKILL.md`
 * (the Claude Code default). Used by the Library room which surfaces ALL ~190 installed
 * skills, not just curated yielde-native + hermes-import ones.
 */
export async function listAllSkills(): Promise<SkillSummary[]> {
  const root = skillsRoot();
  const out: SkillSummary[] = [];

  const { readUsage, historySeries } = await import("./usage");
  const usageFile = await readUsage();
  const usage = usageFile.skills;

  for await (const entry of walkAllSkills(root)) {
    let src: string;
    try { src = await readFile(entry.path, "utf8"); } catch { continue; }
    const { fm } = parseFrontmatter(src);
    const skillName = fm.name || entry.name;
    const u = usage[skillName];
    out.push({
      category: entry.category,
      name: skillName,
      description: fm.description || "",
      provenance: (fm.provenance as string) || "unknown",
      pinned: fm.pinned === true,
      version: (fm.version as string) || "0.0.0",
      uses: u?.uses ?? 0,
      lastUsed: u?.last_used ?? null,
      history: historySeries(u),
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
  // `walkAllSkills` synthesizes the "core" category for flat-root skills
  // (`<root>/<name>/SKILL.md`). Mirror that fallback here so detail links work
  // for both flat and nested layouts.
  const candidates = category === "core"
    ? [join(root, name, "SKILL.md"), join(root, "core", name, "SKILL.md")]
    : [join(root, category, name, "SKILL.md")];
  for (const path of candidates) {
    let src: string;
    try {
      src = await readFile(path, "utf8");
    } catch {
      continue;
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
  return null;
}
