import "server-only";
import { readFile, writeFile, mkdir, rename } from "node:fs/promises";
import { join, dirname } from "node:path";
import { skillsRoot } from "./skills";

const USAGE_VERSION = 1;
const HISTORY_DAYS = 14;

export type SkillUsage = {
  uses: number;
  last_used: string | null;
  history: Record<string, number>;
};

export type UsageFile = {
  version: number;
  skills: Record<string, SkillUsage>;
};

function usagePath(): string {
  return join(skillsRoot(), ".usage.json");
}

function todayKey(now = new Date()): string {
  return now.toISOString().slice(0, 10);
}

function emptyUsage(): SkillUsage {
  return { uses: 0, last_used: null, history: {} };
}

export async function readUsage(): Promise<UsageFile> {
  try {
    const raw = await readFile(usagePath(), "utf8");
    const parsed = JSON.parse(raw);
    if (typeof parsed !== "object" || !parsed) throw new Error("malformed");
    if (parsed.version !== USAGE_VERSION) {
      return { version: USAGE_VERSION, skills: parsed.skills || {} };
    }
    return parsed as UsageFile;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      return { version: USAGE_VERSION, skills: {} };
    }
    throw err;
  }
}

// Atomic write: temp file + rename. Avoids torn writes if the process dies mid-flush.
async function writeUsage(data: UsageFile): Promise<void> {
  const path = usagePath();
  await mkdir(dirname(path), { recursive: true });
  const tmp = `${path}.${process.pid}.tmp`;
  await writeFile(tmp, JSON.stringify(data, null, 2), "utf8");
  await rename(tmp, path);
}

function pruneHistory(history: Record<string, number>): Record<string, number> {
  const cutoff = new Date(Date.now() - HISTORY_DAYS * 24 * 60 * 60 * 1000);
  const cutoffKey = todayKey(cutoff);
  const pruned: Record<string, number> = {};
  for (const [k, v] of Object.entries(history)) {
    if (k >= cutoffKey) pruned[k] = v;
  }
  return pruned;
}

/** Increment the use counter for a skill. Returns the updated record. */
export async function recordUse(name: string): Promise<SkillUsage> {
  const data = await readUsage();
  const skill = data.skills[name] ?? emptyUsage();
  const today = todayKey();
  skill.uses = (skill.uses || 0) + 1;
  skill.last_used = new Date().toISOString();
  skill.history = pruneHistory(skill.history ?? {});
  skill.history[today] = (skill.history[today] || 0) + 1;
  data.skills[name] = skill;
  await writeUsage(data);
  return skill;
}

/** Return a 14-element array of daily counts ending today (oldest first). */
export function historySeries(usage: SkillUsage | undefined, days = HISTORY_DAYS): number[] {
  const out: number[] = [];
  const now = new Date();
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
    const key = todayKey(d);
    out.push(usage?.history?.[key] ?? 0);
  }
  return out;
}
