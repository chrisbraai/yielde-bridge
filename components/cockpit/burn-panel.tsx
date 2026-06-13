import type { Burn } from "@/lib/cockpit/types";
import { Zone, Sparkline, StatCell } from "./primitives";

// RIGHT-NEAR — AI Burn. Today's spend, a 14-day spend sparkline, sessions this week, active now,
// $/session, and the model mix. HONEST empty labels: cost_cents is mostly null right now, so a 0
// here means "no PRICED runs", NOT "no spend". We say that out loud and never invent a figure.

function fmtUsd(cents: number): string {
  if (cents === 0) return "$0.00";
  return `$${(cents / 100).toFixed(2)}`;
}

export function BurnPanel({ burn }: { burn: Burn }) {
  const cents14 = burn.days14.map((d) => d.cents);
  const total14 = cents14.reduce((s, c) => s + c, 0);
  const anyPriced = total14 > 0 || burn.todayCents > 0;
  const maxDay = Math.max(0, ...cents14);

  return (
    <Zone title="AI Burn" titleTone="muted" className="h-full">
      <div className="flex h-full flex-col gap-3">
        {/* today's figure */}
        <div>
          <div className="flex items-baseline gap-2">
            <span
              className={
                "font-mono text-3xl font-bold tabular-nums leading-none " +
                (burn.todayCents > 0 ? "text-zinc-50" : "text-zinc-500")
              }
            >
              {fmtUsd(burn.todayCents)}
            </span>
            <span className="font-mono text-[11px] text-zinc-600">today</span>
          </div>
          {!anyPriced && (
            <div className="mt-1 font-mono text-[10px] leading-tight text-amber-400/80">
              no priced runs yet · empty ≠ zero spend
            </div>
          )}
        </div>

        {/* 14-day spend sparkline */}
        <div>
          <div className="mb-1 flex items-center justify-between font-mono text-[10px] text-zinc-600">
            <span>spend · 14d</span>
            <span>{anyPriced ? `Σ ${fmtUsd(total14)}` : "unpriced"}</span>
          </div>
          <Sparkline
            data={cents14}
            width={300}
            height={32}
            stroke={maxDay === 0 ? "#52525b" : "#a855f7"}
            fill="#a855f7"
            markLast
            className="h-8 w-full"
          />
        </div>

        {/* stat grid */}
        <div className="grid grid-cols-2 gap-x-3 gap-y-2.5">
          <StatCell
            label="sessions / wk"
            value={burn.sessionsThisWeek}
            tone={burn.sessionsThisWeek > 0 ? "default" : "muted"}
            size="sm"
          />
          <StatCell
            label="active now"
            value={burn.activeSessions}
            tone={burn.activeSessions > 0 ? "good" : "muted"}
            size="sm"
            sub={burn.activeSessions > 0 ? "running" : "idle"}
          />
          <StatCell
            label="$ / session"
            value={burn.avgCentsPerSession != null ? fmtUsd(burn.avgCentsPerSession) : "—"}
            tone={burn.avgCentsPerSession != null ? "default" : "muted"}
            size="sm"
            title={burn.avgCentsPerSession == null ? "no priced sessions to average" : undefined}
          />
          <div className="flex min-w-0 flex-col gap-0.5">
            <span className="text-[10px] uppercase tracking-wider font-mono text-zinc-600">
              model mix
            </span>
            {burn.modelMix.length === 0 ? (
              <span className="font-mono text-[11px] text-zinc-600">—</span>
            ) : (
              <div className="flex flex-col gap-0.5">
                {burn.modelMix.slice(0, 3).map((m) => (
                  <div key={m.model} className="flex items-center justify-between gap-1.5">
                    <span className="truncate font-mono text-[10px] text-zinc-400" title={m.model}>
                      {m.model}
                    </span>
                    <span className="shrink-0 font-mono text-[10px] tabular-nums text-zinc-500">
                      {m.pct}%
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </Zone>
  );
}
