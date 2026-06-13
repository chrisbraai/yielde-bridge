import "server-only";
import { getDayState, type DayState } from "../day";
import type { NorthStar, AdvisorState } from "./types";
import { localDateOf, dayDiff } from "./deploy-log";

// North-star + advisor slices are both derived from the SAME Day engine state (state.json), read
// through the existing getDayState() reader — we never re-parse state.json here. getDayState()
// already normalizes the loose on-disk shape and returns a safe uninitialized fallback when the
// engine hasn't run, so these mappers can assume well-formed (possibly empty) inputs.

const EMPTY_NORTH_STAR: NorthStar = {
  goal: "",
  current: 0,
  target: 0,
  dayOf: 0,
  totalDays: 0,
  daysLeft: 0,
};

const EMPTY_ADVISOR: AdvisorState = {
  directive: null,
  sprintMove: null,
  rationale: null,
  status: "pending",
  streak: 0,
};

/**
 * Map Day state's northStar into the cockpit NorthStar.
 *  - dayOf:     local days from startDate to today, +1 so the first day reads "day 1 of N".
 *               Clamped to ≥1 once a startDate exists, and to ≤ totalDays.
 *  - totalDays: local days from startDate to targetDate, +1 (inclusive of both endpoints).
 *  - daysLeft:  local days from today to targetDate, floored at 0.
 */
export function mapNorthStar(state: DayState, now: Date = new Date()): NorthStar {
  const ns = state.northStar;
  if (!ns) return EMPTY_NORTH_STAR;

  const today = localDateOf(now);
  const hasStart = typeof ns.startDate === "string" && ns.startDate.length > 0;
  const hasTarget = typeof ns.targetDate === "string" && ns.targetDate.length > 0;

  const totalDays =
    hasStart && hasTarget ? Math.max(0, dayDiff(ns.targetDate, ns.startDate) + 1) : 0;

  let dayOf = 0;
  if (hasStart) {
    dayOf = dayDiff(today, ns.startDate) + 1; // day 1 on startDate
    if (dayOf < 1) dayOf = 1; // before startDate -> still "day 1"
    if (totalDays > 0 && dayOf > totalDays) dayOf = totalDays;
  }

  const daysLeft = hasTarget ? Math.max(0, dayDiff(ns.targetDate, today)) : 0;

  return {
    goal: ns.goal,
    current: ns.current,
    target: ns.target,
    dayOf,
    totalDays,
    daysLeft,
  };
}

/** Map Day state's today + streak into the AdvisorState the cockpit/advisor surface consumes. */
export function mapAdvisorState(state: DayState): AdvisorState {
  const t = state.today;
  return {
    directive: t.directive,
    sprintMove: t.sprintMove,
    rationale: t.rationale,
    status: t.status,
    streak: state.streak.current,
  };
}

/** Convenience: read Day state once and return both slices. */
export async function getNorthStarAndAdvisor(
  now: Date = new Date(),
): Promise<{ northStar: NorthStar; advisor: AdvisorState }> {
  const state = await getDayState();
  return { northStar: mapNorthStar(state, now), advisor: mapAdvisorState(state) };
}

export { EMPTY_NORTH_STAR, EMPTY_ADVISOR };
