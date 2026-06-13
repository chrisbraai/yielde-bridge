import type { Fleet, RecentRun } from "@/lib/cockpit/types";
import { Zone } from "./primitives";
import { fmtTimestamp } from "@/lib/time";

// RIGHT-FAR (top) — Fleet / System. Active sessions, this week's ✓/✗ tally, and the recent-run feed
// (most-recent-first). Red/green, minimal. weekSuccess/Fail may both be 0 — that's an honest
// "nothing ran" state, not a failure.

const STATUS_TONE: Record<string, string> = {
  done: "text-emerald-400",
  succeeded: "text-emerald-400",
  running: "text-blue-300",
  failed: "text-rose-400",
  error: "text-rose-400",
  skipped: "text-zinc-500",
};

function statusTone(s: string): string {
  return STATUS_TONE[s.toLowerCase()] ?? "text-zinc-400";
}

export function FleetPanel({ fleet }: { fleet: Fleet }) {
  const total = fleet.weekSuccess + fleet.weekFail;
  const successRate = total > 0 ? Math.round((fleet.weekSuccess / total) * 100) : null;

  return (
    <Zone title="Fleet" titleTone="muted" className="min-h-0 flex-1">
      <div className="flex h-full flex-col gap-2.5">
        {/* top stats row */}
        <div className="flex shrink-0 items-end justify-between">
          <div className="flex items-baseline gap-1.5">
            <span
              className={
                "font-mono text-2xl font-semibold tabular-nums leading-none " +
                (fleet.activeSessions > 0 ? "text-blue-300" : "text-zinc-500")
              }
            >
              {fleet.activeSessions}
            </span>
            <span className="font-mono text-[10px] uppercase tracking-wider text-zinc-600">
              active
            </span>
            {fleet.activeSessions > 0 && (
              <span className="ml-0.5 inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-blue-400" />
            )}
          </div>
          <div className="flex items-center gap-2 font-mono text-[11px] tabular-nums">
            <span className="text-emerald-400">✓ {fleet.weekSuccess}</span>
            <span className="text-rose-400">✗ {fleet.weekFail}</span>
            <span className="text-zinc-600">
              {successRate != null ? `${successRate}%` : "—"}
            </span>
          </div>
        </div>

        {/* recent-run feed */}
        <div className="min-h-0 flex-1 overflow-hidden">
          {fleet.recent.length === 0 ? (
            <div className="flex h-full items-center justify-center rounded-lg border border-dashed border-zinc-800/80 text-center font-mono text-[11px] text-zinc-600">
              no runs this week
            </div>
          ) : (
            <ul className="flex flex-col gap-1">
              {fleet.recent.slice(0, 6).map((r, i) => (
                <RunRow key={`${r.kind}-${i}-${r.at}`} run={r} />
              ))}
            </ul>
          )}
        </div>
      </div>
    </Zone>
  );
}

function RunRow({ run }: { run: RecentRun }) {
  return (
    <li className="flex items-center gap-2 border-b border-zinc-900 pb-1 last:border-0">
      <span
        className="shrink-0 font-mono text-[9px] uppercase tracking-wider text-zinc-600"
        title={run.kind}
      >
        {run.kind === "operator" ? "OPR" : "SES"}
      </span>
      <span className="min-w-0 flex-1 truncate text-[11px] text-zinc-400" title={run.label}>
        {run.label}
      </span>
      <span className={`shrink-0 font-mono text-[10px] ${statusTone(run.status)}`}>
        {run.status}
      </span>
      <span
        className="shrink-0 font-mono text-[9px] tabular-nums text-zinc-600"
        title={run.at}
      >
        {fmtTimestamp(run.at, { stripMillis: true }).slice(11, 16)}
      </span>
    </li>
  );
}
