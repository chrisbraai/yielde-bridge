import "server-only";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { homedir } from "node:os";
import { readJsonOrDefault, stripBom } from "./json-io";

// Read-only reader for the `/day` advisor room. Bridge NEVER writes Day state — a separate CLI
// (`~/.claude/day/bin/day.mjs`) owns every write. This module only reads `state.json` and
// `history.jsonl` from `~/.claude/day/data/`. The state file may not exist yet (engine builds in
// parallel), so the reader returns a sane uninitialized fallback and the page branches to onboarding.

export type DayStatus = "pending" | "done" | "partial" | "missed";

export type NorthStar = {
  goal: string;
  metric: string;
  target: number;
  current: number;
  startDate: string; // YYYY-MM-DD
  targetDate: string; // YYYY-MM-DD
};

export type WeekLever = {
  text: string;
  weekOf: string;
  setAt: string;
};

export type DayToday = {
  date: string | null;
  directive: string | null;
  sprintMove: string | null;
  rationale: string | null;
  status: DayStatus;
  morningAckAt: string | null;
  eveningClosedAt: string | null;
  journal: string | null;
};

export type DayTomorrow = {
  date: string;
  directive: string | null;
  sprintMove: string | null;
  rationale: string | null;
} | null;

export type DayStreak = {
  current: number;
  longest: number;
  lastEveningDate: string | null;
  lastMorningDate: string | null;
};

export type DayState = {
  version: number;
  northStar: NorthStar | null;
  weekLever: WeekLever | null;
  today: DayToday;
  tomorrow: DayTomorrow;
  streak: DayStreak;
  updatedAt: string | null;
  // Derived: true when the engine has seeded a real day (a today.date or a northStar goal exists).
  initialized: boolean;
};

export type DayHistoryEntry = {
  date: string;
  directive: string | null;
  sprintMove: string | null;
  rationale: string | null;
  status: DayStatus;
  journal: string | null;
  closedAt: string | null;
};

const EMPTY_TODAY: DayToday = {
  date: null,
  directive: null,
  sprintMove: null,
  rationale: null,
  status: "pending",
  morningAckAt: null,
  eveningClosedAt: null,
  journal: null,
};

const EMPTY_STREAK: DayStreak = {
  current: 0,
  longest: 0,
  lastEveningDate: null,
  lastMorningDate: null,
};

// Uninitialized fallback — what we render before the engine has ever run. `initialized` stays false
// here and is recomputed from real content in getDayState().
const UNINITIALIZED_FALLBACK: DayState = {
  version: 1,
  northStar: null,
  weekLever: null,
  today: EMPTY_TODAY,
  tomorrow: null,
  streak: EMPTY_STREAK,
  updatedAt: null,
  initialized: false,
};

export function dayDataDir(): string {
  if (process.env.YIELDE_DAY_DATA) return process.env.YIELDE_DAY_DATA;
  return join(homedir(), ".claude", "day", "data");
}

function stateFile(): string {
  return join(dayDataDir(), "state.json");
}

function historyFile(): string {
  return join(dayDataDir(), "history.jsonl");
}

// Raw on-disk shape is partial/loose — normalize into our strict types with sane defaults.
type RawState = Partial<{
  version: number;
  northStar: Partial<NorthStar> | null;
  weekLever: Partial<WeekLever> | null;
  today: Partial<DayToday> | null;
  tomorrow: Partial<NonNullable<DayTomorrow>> | null;
  streak: Partial<DayStreak> | null;
  updatedAt: string | null;
}>;

function normStatus(s: unknown): DayStatus {
  return s === "done" || s === "partial" || s === "missed" ? s : "pending";
}

export async function getDayState(): Promise<DayState> {
  const raw = await readJsonOrDefault<RawState>(stateFile(), {});

  const ns = raw.northStar;
  const northStar: NorthStar | null =
    ns && typeof ns.goal === "string" && ns.goal.length > 0
      ? {
          goal: ns.goal,
          metric: ns.metric ?? "",
          target: Number(ns.target ?? 0),
          current: Number(ns.current ?? 0),
          startDate: ns.startDate ?? "",
          targetDate: ns.targetDate ?? "",
        }
      : null;

  const wl = raw.weekLever;
  const weekLever: WeekLever | null =
    wl && typeof wl.text === "string"
      ? { text: wl.text, weekOf: wl.weekOf ?? "", setAt: wl.setAt ?? "" }
      : null;

  const t = raw.today ?? {};
  const today: DayToday = {
    date: t.date ?? null,
    directive: t.directive ?? null,
    sprintMove: t.sprintMove ?? null,
    rationale: t.rationale ?? null,
    status: normStatus(t.status),
    morningAckAt: t.morningAckAt ?? null,
    eveningClosedAt: t.eveningClosedAt ?? null,
    journal: t.journal ?? null,
  };

  const tm = raw.tomorrow;
  const tomorrow: DayTomorrow =
    tm && tm.date
      ? {
          date: tm.date,
          directive: tm.directive ?? null,
          sprintMove: tm.sprintMove ?? null,
          rationale: tm.rationale ?? null,
        }
      : null;

  const st = raw.streak ?? {};
  const streak: DayStreak = {
    current: Number(st.current ?? 0),
    longest: Number(st.longest ?? 0),
    lastEveningDate: st.lastEveningDate ?? null,
    lastMorningDate: st.lastMorningDate ?? null,
  };

  const initialized = Boolean((today.date && today.date.length > 0) || northStar);

  return {
    version: Number(raw.version ?? UNINITIALIZED_FALLBACK.version),
    northStar,
    weekLever,
    today,
    tomorrow,
    streak,
    updatedAt: raw.updatedAt ?? null,
    initialized,
  };
}

/**
 * Read `history.jsonl`, strip BOM, split lines, JSON.parse each in try/catch (skip malformed),
 * dedupe by date keeping the most recent line, return last `n` most-recent-first.
 * `ingest` and any unknown fields on each line are ignored.
 */
export async function getRecentHistory(n: number): Promise<DayHistoryEntry[]> {
  let src: string;
  try {
    src = stripBom(await readFile(historyFile(), "utf8"));
  } catch {
    return [];
  }

  // Keep insertion order but let a later line for the same date win (history may append dupes).
  const byDate = new Map<string, DayHistoryEntry>();
  for (const line of src.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    let parsed: unknown;
    try {
      parsed = JSON.parse(trimmed);
    } catch {
      continue; // skip malformed line
    }
    if (!parsed || typeof parsed !== "object") continue;
    const o = parsed as Record<string, unknown>;
    if (typeof o.date !== "string" || o.date.length === 0) continue;

    const entry: DayHistoryEntry = {
      date: o.date,
      directive: typeof o.directive === "string" ? o.directive : null,
      sprintMove: typeof o.sprintMove === "string" ? o.sprintMove : null,
      rationale: typeof o.rationale === "string" ? o.rationale : null,
      status: normStatus(o.status),
      journal: typeof o.journal === "string" ? o.journal : null,
      closedAt: typeof o.closedAt === "string" ? o.closedAt : null,
    };
    byDate.set(entry.date, entry); // later same-date line overwrites earlier
  }

  // Most-recent-first by calendar date, then take n.
  const sorted = [...byDate.values()].sort((a, b) => b.date.localeCompare(a.date));
  return sorted.slice(0, Math.max(0, n));
}
