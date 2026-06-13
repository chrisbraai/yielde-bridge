import "server-only";
import {
  listRecentSessions,
  listRecentOperatorRuns,
  operatorRunOutcomesSince,
} from "../runtime";
import { syncSessionsFromAudit } from "../session-sync";
import { syncOperatorRuns } from "../operator-runs";
import { activeSessionCount } from "../sessions";
import type { Fleet, RecentRun } from "./types";

// Fleet = what the agent army is doing: how many sessions are live right now, this week's
// operator-run win/loss, and a merged most-recent-first feed of recent session + operator runs.
// Sources: os/sessions.json (live count) + runtime.db (recent runs, outcomes). Best-effort sync
// first. weekSuccess/weekFail come from operator_runs terminal status — sessions don't carry a
// success/fail signal yet, so they're excluded from the win/loss tally (honest: we only score what
// we can actually observe).

const EMPTY_FLEET: Fleet = {
  activeSessions: 0,
  weekSuccess: 0,
  weekFail: 0,
  recent: [],
};

// Truncate long intents/summaries for the scannable feed.
function clip(s: string, max = 80): string {
  const t = s.trim();
  return t.length > max ? t.slice(0, max - 1) + "…" : t;
}

export async function getFleet(limit = 12): Promise<Fleet> {
  await syncSessionsFromAudit().catch(() => undefined);
  await syncOperatorRuns().catch(() => undefined);

  const activeSessions = await activeSessionCount();
  const { succeeded, failed } = operatorRunOutcomesSince(7);

  // Build a merged recent feed. Pull a bit more than `limit` from each source, merge, sort by
  // timestamp desc, then cap.
  const sessions = listRecentSessions(limit);
  const opRuns = listRecentOperatorRuns(limit);

  const recent: RecentRun[] = [];

  for (const s of sessions) {
    const at = s.started_at ?? s.ended_at;
    if (!at) continue;
    const label = s.intent && s.intent.length > 0 ? clip(s.intent) : s.role ?? s.id.slice(0, 8);
    // A session is "running" until it has an ended_at.
    const status = s.ended_at ? "done" : "running";
    recent.push({
      kind: "session",
      label,
      status,
      at,
      costCents: s.cost_cents,
    });
  }

  for (const r of opRuns) {
    const at = r.started_at;
    if (!at) continue;
    const label = clip(`${r.agent}${r.summary ? `: ${r.summary}` : ""}`);
    const status = r.status ?? (r.finished_at ? "done" : "running");
    recent.push({
      kind: "operator",
      label,
      status,
      at,
      costCents: r.cost_cents,
    });
  }

  recent.sort((a, b) => b.at.localeCompare(a.at));

  return {
    activeSessions,
    weekSuccess: succeeded,
    weekFail: failed,
    recent: recent.slice(0, limit),
  };
}

export { EMPTY_FLEET };
