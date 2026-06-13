import "server-only";
import type {
  CockpitSnapshot,
  BuildShip,
  ShipStreak,
  NorthStar,
  Burn,
  Fleet,
  Health,
  AdvisorState,
  GatedItem,
  PrItem,
  ConsistencyStreak,
  HealthDomain,
  LibrarySummary,
} from "./types";
import { getCockpitConfig } from "./config";
import { getBuildShip, EMPTY_BUILD_SHIP } from "./build-ship";
import { readDeployEvents, shipStreak } from "./deploy-log";
import { getNorthStarAndAdvisor, EMPTY_NORTH_STAR, EMPTY_ADVISOR } from "./northstar";
import { getBurn, EMPTY_BURN } from "./burn";
import { getFleet, EMPTY_FLEET } from "./fleet";
import { getHealth, EMPTY_HEALTH } from "./health";
import {
  getConsistencyBoard,
  getWellness,
  EMPTY_CONSISTENCY,
  EMPTY_WELLNESS,
} from "./consistency";
import { getLibrarySummary, EMPTY_LIBRARY } from "./library";

// THE assembler. getCockpitSnapshot() fans out every source under Promise.allSettled so one slow or
// failing source can't sink the whole cockpit — each rejection becomes a string in `errors[]`
// (surfaced, never swallowed) and that slice falls back to a safe empty default. The UI and the
// advisor chat both consume this single snapshot.

const EMPTY_SHIP_STREAK: ShipStreak = { current: 0, longest: 0, lastDeployDate: null };

// ---------------------------------------------------------------------------
// Gated items — "what's waiting on Chris". Derived from the assembled slices so we don't double-read
// any source. v1 signals:
//   - ready (non-draft) PRs: built and waiting on a merge/deploy decision.
//   - stale ship: many days since the last deploy while PRs are ready.
//   - deploy drift: prod is behind origin/main.
// (capability-sourced gates can be added later; the type already allows source:"capability".)
// ---------------------------------------------------------------------------
function deriveGated(buildShip: BuildShip, health: Health): GatedItem[] {
  const out: GatedItem[] = [];

  if (buildShip.ready > 0) {
    out.push({
      source: "pr",
      label: `${buildShip.ready} PR${buildShip.ready === 1 ? "" : "s"} ready to ship`,
      detail:
        buildShip.oldestDays > 0
          ? `oldest open PR is ${buildShip.oldestDays}d old`
          : undefined,
      severity: buildShip.oldestDays >= 7 ? "warn" : "info",
    });
  }

  if (buildShip.daysSinceDeploy != null && buildShip.daysSinceDeploy >= 3 && buildShip.ready > 0) {
    out.push({
      source: "manual",
      label: `${buildShip.daysSinceDeploy}d since last deploy with work ready`,
      detail: "built but not shipped",
      severity: buildShip.daysSinceDeploy >= 7 ? "danger" : "warn",
    });
  }

  if (health.deployDrift?.behind) {
    out.push({
      source: "manual",
      label: "prod is behind origin/main",
      detail:
        health.deployDrift.prodSha && health.deployDrift.mainSha
          ? `prod ${health.deployDrift.prodSha.slice(0, 7)} ≠ main ${health.deployDrift.mainSha.slice(0, 7)}`
          : undefined,
      severity: "danger",
    });
  }

  return out;
}

// Wrap an async producer so a rejection records an error and yields the slice's empty default.
async function settle<T>(
  name: string,
  fn: () => Promise<T>,
  fallback: T,
  errors: string[],
): Promise<T> {
  try {
    return await fn();
  } catch (e) {
    errors.push(`${name}: ${e instanceof Error ? e.message : String(e)}`);
    return fallback;
  }
}

export async function getCockpitSnapshot(now: Date = new Date()): Promise<CockpitSnapshot> {
  const errors: string[] = [];

  // Config first — every other source depends on it. A config failure is non-fatal (defaults exist).
  const config = await settle(
    "config",
    () => getCockpitConfig(),
    {
      repos: ["Yielde-dev/yielde-platform", "Yielde-dev/yielde-site"],
      services: [],
      healthzUrl: null,
      platformClonePath: "C:/Users/chris/yielde-platform",
    },
    errors,
  );

  // Each source gets its own errors array so allSettled-level failures and in-source soft failures
  // both land in the final errors[]. We pass `errors` directly where the source appends soft errors.
  const buildShipP = settle<BuildShip>(
    "buildShip",
    () => getBuildShip(config.repos, errors, now),
    EMPTY_BUILD_SHIP,
    errors,
  );

  const shipStreakP = settle<ShipStreak>(
    "shipStreak",
    async () => {
      const events = await readDeployEvents();
      return shipStreak(events, now);
    },
    EMPTY_SHIP_STREAK,
    errors,
  );

  const nsAdvisorP = settle<{ northStar: NorthStar; advisor: AdvisorState }>(
    "northStar",
    () => getNorthStarAndAdvisor(now),
    { northStar: EMPTY_NORTH_STAR, advisor: EMPTY_ADVISOR },
    errors,
  );

  const burnP = settle<Burn>("burn", () => getBurn(), EMPTY_BURN, errors);
  const fleetP = settle<Fleet>("fleet", () => getFleet(), EMPTY_FLEET, errors);
  const healthP = settle<Health>("health", () => getHealth(config, errors), EMPTY_HEALTH, errors);

  // Consistency board (ship · ritual · workout · diet), wellness domain, and library counts — each
  // settled independently so a missing health log / unreadable registry can't sink the cockpit.
  const consistencyP = settle<ConsistencyStreak[]>(
    "consistency",
    () => getConsistencyBoard(now),
    EMPTY_CONSISTENCY,
    errors,
  );
  const wellnessP = settle<HealthDomain>(
    "wellness",
    () => getWellness(now),
    EMPTY_WELLNESS,
    errors,
  );
  const libraryP = settle<LibrarySummary>(
    "library",
    () => getLibrarySummary(),
    EMPTY_LIBRARY,
    errors,
  );

  const [buildShip, shipStreakRes, nsAdvisor, burn, fleet, health, consistency, wellness, library] =
    await Promise.all([
      buildShipP,
      shipStreakP,
      nsAdvisorP,
      burnP,
      fleetP,
      healthP,
      consistencyP,
      wellnessP,
      libraryP,
    ]);

  const gated = deriveGated(buildShip, health);

  return {
    at: now.toISOString(),
    buildShip,
    shipStreak: shipStreakRes,
    northStar: nsAdvisor.northStar,
    gated,
    burn,
    fleet,
    health,
    advisor: nsAdvisor.advisor,
    consistency,
    wellness,
    library,
    errors,
  };
}

// ---------------------------------------------------------------------------
// Advisor context — a compact, JSON-able subset for injecting into the advisor's system prompt.
// Keep it small: the advisor doesn't need the full 14-day cadence array or every PR, just the
// load-bearing signals to reason about "what should Chris do next".
// ---------------------------------------------------------------------------
// Compact per-lane consistency summary the advisor reasons over (and can log against). We drop the
// 14-day boolean array and keep only the load-bearing scalars.
export type ConsistencySummary = {
  key: ConsistencyStreak["key"];
  label: string;
  current: number;
  longest: number;
  lastDate: string | null;
  adherencePct: number | null;
};

export type WellnessSummary = {
  workout: { current: number; planSummary: string | null; lastNote: string | null };
  diet: { current: number; planSummary: string | null; lastNote: string | null };
};

export type AdvisorContext = {
  at: string;
  northStar: NorthStar;
  advisor: AdvisorState;
  buildShip: {
    builtOpen: number;
    ready: number;
    draft: number;
    oldestDays: number;
    shippedThisWeek: number;
  };
  daysSinceDeploy: number | null;
  shipStreak: ShipStreak;
  topPrs: Pick<PrItem, "repo" | "number" | "title" | "isDraft" | "ageDays">[];
  gated: GatedItem[];
  burnToday: { todayCents: number; activeSessions: number };
  fleetActive: number;
  // Compact wellness + consistency so the advisor can reason about (and log) workout/diet/ritual.
  consistency: ConsistencySummary[];
  wellness: WellnessSummary;
  errors: string[];
};

export async function getAdvisorContext(now: Date = new Date()): Promise<AdvisorContext> {
  const snap = await getCockpitSnapshot(now);
  const board = snap.consistency ?? [];
  const wellness = snap.wellness ?? EMPTY_WELLNESS;
  return {
    at: snap.at,
    northStar: snap.northStar,
    advisor: snap.advisor,
    buildShip: {
      builtOpen: snap.buildShip.builtOpen,
      ready: snap.buildShip.ready,
      draft: snap.buildShip.draft,
      oldestDays: snap.buildShip.oldestDays,
      shippedThisWeek: snap.buildShip.shippedThisWeek,
    },
    daysSinceDeploy: snap.buildShip.daysSinceDeploy,
    shipStreak: snap.shipStreak,
    topPrs: snap.buildShip.prs.slice(0, 5).map((p) => ({
      repo: p.repo,
      number: p.number,
      title: p.title,
      isDraft: p.isDraft,
      ageDays: p.ageDays,
    })),
    gated: snap.gated,
    burnToday: { todayCents: snap.burn.todayCents, activeSessions: snap.burn.activeSessions },
    fleetActive: snap.fleet.activeSessions,
    consistency: board.map((s) => ({
      key: s.key,
      label: s.label,
      current: s.current,
      longest: s.longest,
      lastDate: s.lastDate,
      adherencePct: s.adherencePct,
    })),
    wellness: {
      workout: {
        current: wellness.workout.streak.current,
        planSummary: wellness.workout.planSummary,
        lastNote: wellness.workout.lastNote,
      },
      diet: {
        current: wellness.diet.streak.current,
        planSummary: wellness.diet.planSummary,
        lastNote: wellness.diet.lastNote,
      },
    },
    errors: snap.errors,
  };
}
