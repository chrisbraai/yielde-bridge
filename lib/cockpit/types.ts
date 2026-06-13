// Unified data contract for the Yielde Command cockpit (app/cockpit) and the advisor chat
// (app/api/advisor). BOTH consume getCockpitSnapshot() (lib/cockpit/context.ts). Every field is
// auto-derived from data Chris already generates — no manual upkeep. Source noted per group.
// This file is types only (no runtime) so it can be imported from client and server.

export type ServiceHealth = {
  name: string;
  url: string;
  up: boolean;
  status?: number; // HTTP status if reached
  ms?: number; // round-trip latency
};

export type PrItem = {
  repo: string; // "Yielde-dev/yielde-platform"
  number: number;
  title: string;
  isDraft: boolean;
  ageDays: number;
};

export type GatedSeverity = "info" | "warn" | "danger";

export type GatedItem = {
  source: "pr" | "capability" | "manual";
  label: string; // short, scannable
  detail?: string;
  severity: GatedSeverity;
};

export type RecentRun = {
  kind: "session" | "operator";
  label: string;
  status: string; // "done" | "running" | "failed" | ...
  at: string; // ISO
  costCents?: number | null;
};

export type DeployEvent = {
  at: string; // ISO
  what: string;
  sha?: string;
  repo?: string;
  source: "manual" | "healthz";
};

// HERO: the build-vs-ship gap. Source: gh PR list + ~/.claude/day/data/deploys.jsonl.
export type BuildShip = {
  builtOpen: number; // total open PRs across tracked repos
  ready: number;
  draft: number;
  oldestDays: number;
  prs: PrItem[]; // capped, oldest-first
  shippedThisWeek: number; // deploy events in last 7 local days
  daysSinceDeploy: number | null; // null if never deployed
  deployCadence14: number[]; // length 14, deploy count per day, oldest -> newest (today last)
  leadTimeDays: number | null; // best-effort median commit->deploy; null if unknown
};

export type ShipStreak = {
  current: number;
  longest: number;
  lastDeployDate: string | null; // YYYY-MM-DD
};

export type NorthStar = {
  goal: string; // "5 paying clients"
  current: number; // clients so far
  target: number;
  dayOf: number; // day X of N (1-based)
  totalDays: number;
  daysLeft: number;
};

export type Burn = {
  todayCents: number;
  days14: { day: string; cents: number }[]; // length 14, oldest -> newest
  sessionsThisWeek: number;
  activeSessions: number;
  avgCentsPerSession: number | null;
  modelMix: { model: string; pct: number }[]; // top models by share, desc
};

export type Fleet = {
  activeSessions: number;
  weekSuccess: number;
  weekFail: number;
  recent: RecentRun[]; // most-recent-first, capped
};

export type Health = {
  services: ServiceHealth[];
  deployDrift: { behind: boolean; prodSha?: string; mainSha?: string } | null;
};

export type AdvisorState = {
  directive: string | null;
  sprintMove: string | null;
  rationale: string | null;
  status: string; // pending | done | partial | missed
  streak: number; // the showing-up (ritual) streak from the Day engine
};

// ---- Consistency (Chris explicitly values it) — ONE streak mechanic across domains ----
export type ConsistencyKey = "ship" | "ritual" | "workout" | "diet";

export type ConsistencyStreak = {
  key: ConsistencyKey;
  label: string;
  current: number; // consecutive days; never-miss-twice forgiveness (like the ritual streak)
  longest: number;
  lastDate: string | null; // YYYY-MM-DD
  history14: (boolean | null)[]; // length 14, oldest->newest: true=hit, false=miss, null=no data
  adherencePct: number | null; // hits / tracked days over the window (workout/diet)
};

// Wellness domain (workout + diet) — kept DISTINCT from system `health` (services/deploy drift).
export type HealthDomain = {
  workout: { streak: ConsistencyStreak; planSummary: string | null; lastNote: string | null };
  diet: { streak: ConsistencyStreak; planSummary: string | null; lastNote: string | null };
};

// Library counts for a cockpit header; the FULL lists are read directly by the UI from lib/skills|agents|scripts.
export type LibrarySummary = {
  skills: number;
  agents: number;
  scripts: number;
  capabilitiesGranted: number;
};

export type CockpitSnapshot = {
  at: string; // ISO timestamp of assembly
  buildShip: BuildShip;
  shipStreak: ShipStreak;
  northStar: NorthStar;
  gated: GatedItem[]; // what's gated on Chris
  burn: Burn;
  fleet: Fleet;
  health: Health;
  advisor: AdvisorState;
  consistency?: ConsistencyStreak[]; // ship, ritual, workout, diet — the consistency board
  wellness?: HealthDomain; // workout + diet plans + streaks
  library?: LibrarySummary; // skills/agents/scripts/capabilities counts
  errors: string[]; // non-fatal source failures — surfaced, never swallowed
};

// ---- Advisor chat wire protocol (app/api/advisor SSE events) ----
// The advisor reads autonomously; any tool with side effects (Bash/Edit/Write/deploy) is surfaced
// as an "action" the user must explicitly approve before it runs ("on your say-so").
export type AdvisorSseEvent =
  | { type: "session"; sessionId: string }
  | { type: "token"; text: string }
  | { type: "tool"; name: string; summary: string } // a read-only tool the advisor ran
  | { type: "action"; id: string; command: string; danger: GatedSeverity; explanation: string } // awaits confirm
  | { type: "action-result"; id: string; ok: boolean; output: string }
  | { type: "done"; costUsd?: number }
  | { type: "error"; message: string };
