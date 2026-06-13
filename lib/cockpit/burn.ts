import "server-only";
import {
  listDailyCostBuckets,
  sessionsStartedSince,
  modelMixSince,
  avgSessionCostCentsSince,
} from "../runtime";
import { syncSessionsFromAudit } from "../session-sync";
import { syncOperatorRuns } from "../operator-runs";
import { activeSessionCount } from "../sessions";
import type { Burn } from "./types";

// Burn = spend + activity over the last 14 local days, read from runtime.db (the same source the
// /run/cost page uses). We sync first (audit -> sessions, operator run JSONL -> operator_runs), both
// best-effort, then roll up. COST TELEMETRY IS CURRENTLY SPARSE: the kernel doesn't yet emit
// session.cost, so cost_cents is mostly NULL and todayCents/avgCentsPerSession will often be 0/null.
// We surface that honestly rather than fabricating spend — the UI should render an explicit
// "no priced runs yet" empty state, not a fake number.

const EMPTY_BURN: Burn = {
  todayCents: 0,
  days14: [],
  sessionsThisWeek: 0,
  activeSessions: 0,
  avgCentsPerSession: null,
  modelMix: [],
};

export async function getBurn(now: Date = new Date()): Promise<Burn> {
  // Best-effort syncs — never let a sync failure sink the slice.
  await syncSessionsFromAudit().catch(() => undefined);
  await syncOperatorRuns().catch(() => undefined);

  const buckets = listDailyCostBuckets(14); // oldest -> newest, length 14
  const days14 = buckets.map((b) => ({
    day: b.day,
    cents: b.session_cents + b.operator_cents,
  }));

  // Today's bucket is the last entry (listDailyCostBuckets ends at date('now')).
  const todayCents = days14.length > 0 ? days14[days14.length - 1]!.cents : 0;

  const sessionsThisWeek = sessionsStartedSince(7);
  const activeSessions = await activeSessionCount();
  const avgCentsPerSession = avgSessionCostCentsSince(7);

  // Model mix: top models by session count last 7d, expressed as share-of-counted-sessions %.
  const mixRows = modelMixSince(7, 6);
  const totalMix = mixRows.reduce((s, r) => s + r.count, 0);
  const modelMix =
    totalMix > 0
      ? mixRows.map((r) => ({ model: r.model, pct: Math.round((r.count / totalMix) * 100) }))
      : [];

  return {
    todayCents,
    days14,
    sessionsThisWeek,
    activeSessions,
    avgCentsPerSession,
    modelMix,
  };
}

export { EMPTY_BURN };
