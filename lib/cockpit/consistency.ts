import "server-only";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { homedir } from "node:os";
import { stripBom, readJsonOrDefault } from "../json-io";
import type {
  ConsistencyKey,
  ConsistencyStreak,
  HealthDomain,
  WorkoutSession,
  WorkoutExercise,
  DietMacros,
} from "./types";
import { localDateOf, addLocalDays, dayDiff, readDeployEvents, deployDays } from "./deploy-log";

// ---------------------------------------------------------------------------
// ONE streak mechanic across four domains (ship · ritual · workout · diet). The math is a single
// PURE function, `streakFromHitDates`, so every board lane is computed identically and is
// unit-testable without touching the filesystem. The fs-reading assemblers below feed it.
//
// THE STREAK RULE — "never-miss-twice" forgiveness (matches the Day engine's ritual streak in
// ~/.claude/day/bin/day.mjs updateStreak):
//   - A day either has a "hit" (the domain's success event fired that local calendar day) or not.
//   - `current` = the length of the unbroken-with-forgiveness run of hit days that ENDS at the most
//     recent expected slot. The expected slot is TODAY if there's a hit today, else YESTERDAY.
//     One single gap day inside the run is FORGIVEN (a day-gap of 2 still extends the run); a gap of
//     ≥3 (two or more consecutive missed days) RESETS the run. If the latest hit is older than
//     yesterday (≥2 days stale and not reachable by one forgiveness step from today), current = 0.
//     Today-not-yet-hit does NOT break a streak that ran through yesterday — you still have today.
//   - `longest` = the longest forgiving run anywhere in history (same gap≤2 extension rule).
//   - `lastDate` = the most recent hit day (YYYY-MM-DD), or null.
//   - `history14` = length-14 booleans oldest->newest (index 13 = today). true=hit, false=miss,
//     null=day predates the start of tracking (only when a tracking-start anchor is known).
//   - `adherencePct` = hits within the 14-day window / number of TRACKED days in that window
//     (a day is "tracked" if it is on/after the start anchor; without an anchor all 14 are tracked).
// ---------------------------------------------------------------------------

export function healthLogPath(): string {
  if (process.env.YIELDE_HEALTH_LOG) return process.env.YIELDE_HEALTH_LOG;
  return join(homedir(), ".claude", "day", "data", "health.jsonl");
}

export function healthPlansPath(): string {
  if (process.env.YIELDE_HEALTH_PLANS) return process.env.YIELDE_HEALTH_PLANS;
  return join(homedir(), ".claude", "day", "data", "health-plans.json");
}

export function dayHistoryPath(): string {
  if (process.env.YIELDE_DAY_HISTORY) return process.env.YIELDE_DAY_HISTORY;
  return join(homedir(), ".claude", "day", "data", "history.jsonl");
}

// ---------------------------------------------------------------------------
// THE pure streak builder. PURE: takes a set of hit local-day strings + a `now` anchor (and an
// optional tracking-start day) and returns a fully-formed ConsistencyStreak. No IO.
// ---------------------------------------------------------------------------

export type StreakOpts = {
  key: ConsistencyKey;
  label: string;
  /**
   * First local day on which this domain began being tracked (YYYY-MM-DD). When known, days in the
   * 14-window before this anchor render as `null` (no-data) in history14 and are excluded from the
   * adherence denominator. When omitted, the whole window is treated as tracked.
   */
  startDate?: string | null;
  /** Whether to compute adherencePct. Defaults true. */
  adherence?: boolean;
};

export function streakFromHitDates(
  hitDates: Set<string>,
  now: Date,
  opts: StreakOpts,
): ConsistencyStreak {
  const today = localDateOf(now);
  const yesterday = addLocalDays(today, -1);

  // Distinct, ascending hit days.
  const days = [...hitDates].filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d)).sort((a, b) =>
    a.localeCompare(b),
  );

  const lastDate = days.length > 0 ? days[days.length - 1]! : null;

  // ---- longest: forgiving run over ascending distinct days (gap 1 or 2 extends) ----
  let longest = 0;
  if (days.length > 0) {
    longest = 1;
    let run = 1;
    for (let i = 1; i < days.length; i++) {
      const gap = dayDiff(days[i]!, days[i - 1]!);
      if (gap === 1 || gap === 2) run++;
      else run = 1;
      if (run > longest) longest = run;
    }
  }

  // ---- current: live only if latest hit is today or yesterday; one-gap forgiveness backwards ----
  let current = 0;
  if (lastDate === today || lastDate === yesterday) {
    current = 1;
    for (let i = days.length - 1; i > 0; i--) {
      const gap = dayDiff(days[i]!, days[i - 1]!);
      if (gap === 1 || gap === 2) current++;
      else break;
    }
  }

  // ---- history14: length 14, oldest -> newest (index 13 = today) ----
  const hitSet = new Set(days);
  const start = opts.startDate && /^\d{4}-\d{2}-\d{2}$/.test(opts.startDate) ? opts.startDate : null;
  const history14: (boolean | null)[] = [];
  let trackedDays = 0;
  let hits = 0;
  for (let i = 0; i < 14; i++) {
    const day = addLocalDays(today, i - 13); // i=0 -> today-13, i=13 -> today
    const beforeStart = start != null && dayDiff(day, start) < 0;
    if (beforeStart) {
      history14.push(null);
      continue;
    }
    const hit = hitSet.has(day);
    history14.push(hit);
    trackedDays++;
    if (hit) hits++;
  }

  let adherencePct: number | null = null;
  if (opts.adherence !== false) {
    adherencePct = trackedDays > 0 ? Math.round((hits / trackedDays) * 100) : 0;
  }

  return {
    key: opts.key,
    label: opts.label,
    current,
    longest,
    lastDate,
    history14,
    adherencePct,
  };
}

// ---------------------------------------------------------------------------
// Health (wellness) log parsing — workout + diet entries from health.jsonl.
// ---------------------------------------------------------------------------

type HealthEntry = {
  date: string;
  kind: "workout" | "diet";
  onPlan?: boolean;
  done?: boolean;
  note?: string | null;
  at?: string | null;
};

/** Parse raw health.jsonl into HealthEntries, skipping blank/malformed lines. Pure. */
export function parseHealthLines(raw: string): HealthEntry[] {
  const src = stripBom(raw);
  const out: HealthEntry[] = [];
  for (const line of src.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    let parsed: unknown;
    try {
      parsed = JSON.parse(trimmed);
    } catch {
      continue;
    }
    if (!parsed || typeof parsed !== "object") continue;
    const r = parsed as Record<string, unknown>;
    if (typeof r.date !== "string" || r.date.length === 0) continue;
    if (r.kind !== "workout" && r.kind !== "diet") continue;
    out.push({
      date: r.date,
      kind: r.kind,
      onPlan: typeof r.onPlan === "boolean" ? r.onPlan : undefined,
      done: typeof r.done === "boolean" ? r.done : undefined,
      note: typeof r.note === "string" ? r.note : null,
      at: typeof r.at === "string" ? r.at : null,
    });
  }
  return out;
}

async function readHealthEntries(path = healthLogPath()): Promise<HealthEntry[]> {
  let raw: string;
  try {
    raw = await readFile(path, "utf8");
  } catch {
    return []; // not there yet — Chris hasn't logged a workout/diet
  }
  return parseHealthLines(raw);
}

// The OLD shape was just { workout:{summary}, diet:{summary} }. The NEW rich shape adds a dated
// `workout.sessions[]` powerlifting block and `diet.byWeekday` macro targets. Every rich field is
// optional and parsed defensively below — a malformed/missing field falls back to null, never throws.
type RawWorkoutExercise = { name?: unknown; sets?: unknown };
type RawWorkoutSession = { date?: unknown; label?: unknown; exercises?: unknown };
type RawMacros = { kcal?: unknown; protein?: unknown; carbs?: unknown; fat?: unknown };
type HealthPlans = {
  workout?: {
    summary?: string | null;
    targetPerWeek?: number;
    program?: unknown;
    sessions?: unknown;
  } | null;
  diet?: {
    summary?: string | null;
    rules?: unknown[];
    byWeekday?: unknown;
  } | null;
};

function planSummary(plan: { summary?: string | null } | null | undefined): string | null {
  if (!plan || typeof plan.summary !== "string") return null;
  const s = plan.summary.trim();
  return s.length > 0 ? s : null;
}

// Local weekday key for a Date — index by getDay() (0=Sunday). LOCAL day, matching the cockpit's
// localDateOf() convention (never UTC).
const WEEKDAY_KEYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const;
// Display order for the week strip (Mon → Sun), independent of getDay()'s Sunday-first ordering.
const WEEK_STRIP_ORDER = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;

function nonEmptyString(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const s = v.trim();
  return s.length > 0 ? s : null;
}

/** Parse one macro block to DietMacros — all four keys must be finite numbers, else null. Pure. */
function parseMacros(raw: unknown): DietMacros | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as RawMacros;
  const nums = [r.kcal, r.protein, r.carbs, r.fat];
  if (!nums.every((n) => typeof n === "number" && Number.isFinite(n))) return null;
  return {
    kcal: r.kcal as number,
    protein: r.protein as number,
    carbs: r.carbs as number,
    fat: r.fat as number,
  };
}

/** Parse one raw session into a WorkoutSession (date may be null), or null if unusable. Pure. */
function parseSession(raw: unknown): WorkoutSession | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as RawWorkoutSession;
  const label = nonEmptyString(r.label);
  if (label == null) return null; // a session with no label isn't renderable
  const date = typeof r.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(r.date) ? r.date : null;
  const exercises: WorkoutExercise[] = [];
  if (Array.isArray(r.exercises)) {
    for (const ex of r.exercises) {
      if (!ex || typeof ex !== "object") continue;
      const e = ex as RawWorkoutExercise;
      const name = nonEmptyString(e.name);
      if (name == null) continue;
      const sets = Array.isArray(e.sets)
        ? e.sets.filter((s): s is string => typeof s === "string" && s.trim().length > 0)
        : [];
      exercises.push({ name, sets });
    }
  }
  return { date, label, exercises };
}

/** All renderable sessions from the plan, in input order. Pure. */
function parseSessions(raw: unknown): WorkoutSession[] {
  if (!Array.isArray(raw)) return [];
  const out: WorkoutSession[] = [];
  for (const s of raw) {
    const parsed = parseSession(s);
    if (parsed) out.push(parsed);
  }
  return out;
}

/** Earliest tracked day for a kind (its first appearance in the log), or null. */
function firstDayOf(entries: HealthEntry[], kind: "workout" | "diet"): string | null {
  let min: string | null = null;
  for (const e of entries) {
    if (e.kind !== kind) continue;
    if (min == null || e.date.localeCompare(min) < 0) min = e.date;
  }
  return min;
}

/** Most-recent non-empty note for a kind (by `at` timestamp, falling back to date order). */
function lastNoteOf(entries: HealthEntry[], kind: "workout" | "diet"): string | null {
  let best: { key: string; note: string } | null = null;
  for (const e of entries) {
    if (e.kind !== kind) continue;
    if (!e.note || e.note.trim().length === 0) continue;
    const key = e.at && e.at.length > 0 ? e.at : e.date;
    if (best == null || key.localeCompare(best.key) > 0) best = { key, note: e.note.trim() };
  }
  return best ? best.note : null;
}

/**
 * Assemble the wellness domain (workout + diet). A workout hit = any `workout` entry that local day.
 * A diet hit = a `diet` entry with onPlan:true that local day. Plan summaries come from
 * health-plans.json; lastNote = most recent note per kind.
 */
export async function getWellness(now: Date = new Date()): Promise<HealthDomain> {
  const [entries, plans] = await Promise.all([
    readHealthEntries(),
    readJsonOrDefault<HealthPlans>(healthPlansPath(), {}),
  ]);

  const workoutHits = new Set<string>();
  const dietHits = new Set<string>();
  for (const e of entries) {
    if (e.kind === "workout") workoutHits.add(e.date);
    else if (e.kind === "diet" && e.onPlan === true) dietHits.add(e.date);
  }

  const workoutStart = firstDayOf(entries, "workout");
  const dietStart = firstDayOf(entries, "diet");

  const workoutStreak = streakFromHitDates(workoutHits, now, {
    key: "workout",
    label: "Workout",
    startDate: workoutStart,
  });
  const dietStreak = streakFromHitDates(dietHits, now, {
    key: "diet",
    label: "Diet",
    startDate: dietStart,
  });

  // ---- Rich plan fields (date/weekday-aware). Defensive: anything malformed/absent → null. ----
  const today = localDateOf(now);
  const program = nonEmptyString(plans.workout?.program);
  const sessions = parseSessions(plans.workout?.sessions);

  // today's session = the dated session whose date === today (rest day → null).
  const todaySession = sessions.find((s) => s.date === today) ?? null;
  // next session = earliest dated session strictly AFTER today (the "what's next" peek).
  let nextSession: WorkoutSession | null = null;
  for (const s of sessions) {
    if (s.date == null) continue;
    if (dayDiff(s.date, today) <= 0) continue; // not strictly after today
    if (nextSession == null || dayDiff(s.date, nextSession.date as string) < 0) nextSession = s;
  }

  // today's macros = byWeekday[weekdayKey] for the LOCAL day-of-week.
  const byWeekday =
    plans.diet?.byWeekday && typeof plans.diet.byWeekday === "object"
      ? (plans.diet.byWeekday as Record<string, unknown>)
      : null;
  const weekdayKey = WEEKDAY_KEYS[now.getDay()]!;
  const todayMacros = byWeekday ? parseMacros(byWeekday[weekdayKey]) : null;

  // week strip = mon..sun with whatever macros parse (skip missing); null if the table is absent.
  let weekMacros: { weekday: string; macros: DietMacros }[] | null = null;
  if (byWeekday) {
    const strip: { weekday: string; macros: DietMacros }[] = [];
    for (const wd of WEEK_STRIP_ORDER) {
      const m = parseMacros(byWeekday[wd]);
      if (m) strip.push({ weekday: wd, macros: m });
    }
    weekMacros = strip.length > 0 ? strip : null;
  }

  return {
    workout: {
      streak: workoutStreak,
      planSummary: planSummary(plans.workout),
      lastNote: lastNoteOf(entries, "workout"),
      program,
      todaySession,
      nextSession,
    },
    diet: {
      streak: dietStreak,
      planSummary: planSummary(plans.diet),
      lastNote: lastNoteOf(entries, "diet"),
      todayMacros,
      weekday: byWeekday ? weekdayKey : null,
      weekMacros,
    },
  };
}

// ---------------------------------------------------------------------------
// Ritual hit-days — local days with a CLOSED evening, from the Day engine's history.jsonl.
// ---------------------------------------------------------------------------

/** Local days that have a closed-evening history entry (closedAt present). Pure given raw. */
export function ritualClosedDays(raw: string): Set<string> {
  const src = stripBom(raw);
  const out = new Set<string>();
  for (const line of src.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    let parsed: unknown;
    try {
      parsed = JSON.parse(trimmed);
    } catch {
      continue;
    }
    if (!parsed || typeof parsed !== "object") continue;
    const o = parsed as Record<string, unknown>;
    if (typeof o.date !== "string" || o.date.length === 0) continue;
    // A closed evening is what advances the ritual streak. closedAt is stamped on close-evening.
    if (typeof o.closedAt === "string" && o.closedAt.length > 0) out.add(o.date);
  }
  return out;
}

async function readRitualClosedDays(path = dayHistoryPath()): Promise<Set<string>> {
  let raw: string;
  try {
    raw = await readFile(path, "utf8");
  } catch {
    return new Set();
  }
  return ritualClosedDays(raw);
}

// ---------------------------------------------------------------------------
// THE board — four lanes (ship, ritual, workout, diet) in that order, all via streakFromHitDates.
// ---------------------------------------------------------------------------

export async function getConsistencyBoard(now: Date = new Date()): Promise<ConsistencyStreak[]> {
  const [deployEvents, ritualDays, wellness] = await Promise.all([
    readDeployEvents(),
    readRitualClosedDays(),
    getWellness(now),
  ]);

  // ship: deploy days (reuse deploy-log's deployDays reader).
  const shipDays = new Set(deployDays(deployEvents));
  const ship = streakFromHitDates(shipDays, now, {
    key: "ship",
    label: "Ship",
    adherence: true,
  });

  // ritual: closed-evening days from the Day engine history.
  const ritual = streakFromHitDates(ritualDays, now, {
    key: "ritual",
    label: "Showing up",
    adherence: true,
  });

  // workout + diet: reuse the streaks getWellness already computed (identical math).
  return [ship, ritual, wellness.workout.streak, wellness.diet.streak];
}

const EMPTY_STREAK = (key: ConsistencyKey, label: string): ConsistencyStreak => ({
  key,
  label,
  current: 0,
  longest: 0,
  lastDate: null,
  history14: new Array<boolean | null>(14).fill(false),
  adherencePct: 0,
});

export const EMPTY_CONSISTENCY: ConsistencyStreak[] = [
  EMPTY_STREAK("ship", "Ship"),
  EMPTY_STREAK("ritual", "Showing up"),
  EMPTY_STREAK("workout", "Workout"),
  EMPTY_STREAK("diet", "Diet"),
];

export const EMPTY_WELLNESS: HealthDomain = {
  workout: { streak: EMPTY_STREAK("workout", "Workout"), planSummary: null, lastNote: null },
  diet: { streak: EMPTY_STREAK("diet", "Diet"), planSummary: null, lastNote: null },
};
