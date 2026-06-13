import "server-only";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { homedir } from "node:os";
import { stripBom } from "../json-io";
import type { DeployEvent } from "./types";

// Reads ~/.claude/day/data/deploys.jsonl — one DeployEvent per line, written by
// `day.mjs shipped`. Plain UTF-8 (no BOM expected) but we strip a BOM defensively and skip any
// malformed/incomplete line. All derived stats below are PURE functions of an in-memory event list
// plus a "now" anchor, so they are unit-testable without touching the filesystem.

export function deployLogPath(): string {
  if (process.env.YIELDE_DEPLOYS_LOG) return process.env.YIELDE_DEPLOYS_LOG;
  return join(homedir(), ".claude", "day", "data", "deploys.jsonl");
}

// ---------------------------------------------------------------------------
// Local-day helpers — every date here is the LOCAL calendar day (matching the
// Day engine's localDate()). We never use UTC day boundaries for "today".
// ---------------------------------------------------------------------------

/** Local YYYY-MM-DD for a given Date. */
export function localDateOf(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Local YYYY-MM-DD string `n` whole days offset from a base local-day string. */
export function addLocalDays(dateStr: string, n: number): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  // Noon-anchored to dodge DST edge slips.
  const base = new Date(y, m - 1, d, 12, 0, 0, 0);
  base.setDate(base.getDate() + n);
  return localDateOf(base);
}

/** Whole-day difference a - b (both YYYY-MM-DD). Positive when a is after b. */
export function dayDiff(a: string, b: string): number {
  const [ay, am, ad] = a.split("-").map(Number);
  const [by, bm, bd] = b.split("-").map(Number);
  const da = Date.UTC(ay, am - 1, ad);
  const dbb = Date.UTC(by, bm - 1, bd);
  return Math.round((da - dbb) / 86400000);
}

// ---------------------------------------------------------------------------
// Parsing
// ---------------------------------------------------------------------------

function isDeployEvent(o: unknown): o is DeployEvent {
  if (!o || typeof o !== "object") return false;
  const r = o as Record<string, unknown>;
  if (typeof r.at !== "string" || r.at.length === 0) return false;
  if (typeof r.what !== "string") return false;
  // `at` must be a parseable timestamp.
  if (Number.isNaN(new Date(r.at).getTime())) return false;
  return true;
}

/** Parse raw JSONL content into DeployEvents, skipping blank/malformed lines. Pure. */
export function parseDeployLines(raw: string): DeployEvent[] {
  const src = stripBom(raw);
  const out: DeployEvent[] = [];
  for (const line of src.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    let parsed: unknown;
    try {
      parsed = JSON.parse(trimmed);
    } catch {
      continue; // skip malformed line
    }
    if (!isDeployEvent(parsed)) continue;
    const r = parsed as Record<string, unknown>;
    out.push({
      at: r.at as string,
      what: r.what as string,
      sha: typeof r.sha === "string" ? r.sha : undefined,
      repo: typeof r.repo === "string" ? r.repo : undefined,
      source: r.source === "healthz" ? "healthz" : "manual",
    });
  }
  return out;
}

/** Read + parse the deploy log from disk. Returns [] if absent/unreadable. */
export async function readDeployEvents(path = deployLogPath()): Promise<DeployEvent[]> {
  let raw: string;
  try {
    raw = await readFile(path, "utf8");
  } catch {
    return []; // not there yet — Chris hasn't shipped
  }
  return parseDeployLines(raw);
}

// ---------------------------------------------------------------------------
// Derived stats (PURE — take events + a `now` Date so tests pin the anchor)
// ---------------------------------------------------------------------------

/** Distinct local-day strings that have ≥1 deploy, ascending. */
export function deployDays(events: DeployEvent[]): string[] {
  const set = new Set<string>();
  for (const e of events) {
    const d = new Date(e.at);
    if (Number.isNaN(d.getTime())) continue;
    set.add(localDateOf(d));
  }
  return [...set].sort((a, b) => a.localeCompare(b));
}

/** Count of deploy events whose local day is within the last 7 local days (today inclusive). */
export function shippedThisWeek(events: DeployEvent[], now: Date = new Date()): number {
  const today = localDateOf(now);
  const cutoff = addLocalDays(today, -6); // 7-day window inclusive of today
  let n = 0;
  for (const e of events) {
    const d = new Date(e.at);
    if (Number.isNaN(d.getTime())) continue;
    const day = localDateOf(d);
    if (dayDiff(day, cutoff) >= 0 && dayDiff(today, day) >= 0) n++;
  }
  return n;
}

/** Whole local days since the most recent deploy. null if never deployed. 0 if deployed today. */
export function daysSinceDeploy(events: DeployEvent[], now: Date = new Date()): number | null {
  const days = deployDays(events);
  if (days.length === 0) return null;
  const latest = days[days.length - 1]!;
  const today = localDateOf(now);
  return Math.max(0, dayDiff(today, latest));
}

/**
 * Length-14 array of deploy COUNT per local day, oldest -> newest, today last.
 * Index 13 = today, index 0 = today-13.
 */
export function deployCadence14(events: DeployEvent[], now: Date = new Date()): number[] {
  const today = localDateOf(now);
  const buckets = new Array<number>(14).fill(0);
  // Precompute the 14 day-strings for O(1) index lookup.
  const dayIndex = new Map<string, number>();
  for (let i = 0; i < 14; i++) {
    // i=0 -> oldest (today-13), i=13 -> today
    dayIndex.set(addLocalDays(today, i - 13), i);
  }
  for (const e of events) {
    const d = new Date(e.at);
    if (Number.isNaN(d.getTime())) continue;
    const idx = dayIndex.get(localDateOf(d));
    if (idx !== undefined) buckets[idx]++;
  }
  return buckets;
}

export type ShipStreakResult = {
  current: number;
  longest: number;
  lastDeployDate: string | null;
};

/**
 * Ship streak over deploy days.
 *
 * RULE:
 *  - A "shipping day" = a local calendar day with ≥1 deploy event.
 *  - `current`: the length of the unbroken run of consecutive shipping days that ENDS at the most
 *    recent expected slot. The expected slot is TODAY if there is a deploy today, else YESTERDAY.
 *    Concretely: if the latest deploy day is today OR yesterday, count backwards from the latest
 *    deploy day over consecutive days (latest, latest-1, latest-2, …) until a gap; that count is
 *    `current`. If the latest deploy day is older than yesterday (≥2 days stale), the streak is
 *    considered broken and `current` = 0. (Today-not-yet-shipped does NOT break a streak that ran
 *    through yesterday — you still have today to ship.)
 *  - `longest`: the longest run of consecutive shipping days anywhere in history.
 *  - `lastDeployDate`: the most recent shipping day (YYYY-MM-DD), or null if never.
 */
export function shipStreak(events: DeployEvent[], now: Date = new Date()): ShipStreakResult {
  const days = deployDays(events); // ascending, distinct
  if (days.length === 0) return { current: 0, longest: 0, lastDeployDate: null };

  const lastDeployDate = days[days.length - 1]!;
  const today = localDateOf(now);
  const yesterday = addLocalDays(today, -1);

  // ---- longest: scan ascending distinct days for the longest consecutive run ----
  let longest = 1;
  let run = 1;
  for (let i = 1; i < days.length; i++) {
    if (dayDiff(days[i]!, days[i - 1]!) === 1) {
      run++;
    } else {
      run = 1;
    }
    if (run > longest) longest = run;
  }

  // ---- current: only "live" if latest deploy day is today or yesterday ----
  let current = 0;
  if (lastDeployDate === today || lastDeployDate === yesterday) {
    // Count consecutive days ending at lastDeployDate, walking backwards through `days`.
    current = 1;
    for (let i = days.length - 1; i > 0; i--) {
      if (dayDiff(days[i]!, days[i - 1]!) === 1) {
        current++;
      } else {
        break;
      }
    }
  }

  return { current, longest, lastDeployDate };
}

/**
 * Best-effort lead time (commit -> deploy) in days. v1: null. The DeployEvent shape doesn't carry
 * the originating commit timestamp, so we can't derive a real median without extra git lookups.
 * Kept as a stub so the field exists and the caller surfaces null honestly until the data lands.
 */
export function leadTimeDays(_events: DeployEvent[]): number | null {
  return null;
}
