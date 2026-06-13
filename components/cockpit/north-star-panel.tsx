import type { NorthStar } from "@/lib/cockpit/types";
import { Zone } from "./primitives";

// LEFT-NEAR — North Star. "5 paying clients", current/target as a scoreboard (0/5 should read like
// a scoreboard, not vanity), day X of N, days left, and a slim arc that fills with progress. Calm
// blue→emerald gradient; honest when current is 0.

export function NorthStarPanel({ northStar }: { northStar: NorthStar }) {
  const ns = northStar;
  const target = Math.max(1, ns.target);
  const pct = Math.min(100, Math.max(0, Math.round((ns.current / target) * 100)));
  const timePct =
    ns.totalDays > 0 ? Math.min(100, Math.max(0, Math.round((ns.dayOf / ns.totalDays) * 100))) : 0;
  // Pace flag: are we ahead of the clock? (progress% vs elapsed-time%). Honest, not vanity.
  const onPace = pct >= timePct;

  return (
    <Zone title="North Star" titleTone="accent" tone="default" className="h-full">
      <div className="flex h-full flex-col">
        <div className="flex items-baseline justify-between">
          <h2 className="text-base font-semibold leading-tight text-zinc-100">{ns.goal}</h2>
        </div>

        {/* scoreboard */}
        <div className="mt-3 flex items-baseline gap-1.5">
          <span className="font-mono text-5xl font-bold tabular-nums leading-none text-zinc-50">
            {ns.current}
          </span>
          <span className="font-mono text-2xl tabular-nums text-zinc-600">/ {ns.target}</span>
        </div>
        <div className="mt-1 font-mono text-[10px] uppercase tracking-wider text-zinc-600">
          {ns.current === 0 ? "scoreboard · still 0 — get the first" : `${pct}% of target`}
        </div>

        {/* progress arc (semicircle) */}
        <div className="mt-3 flex items-center justify-center">
          <ProgressArc pct={pct} />
        </div>

        {/* time track */}
        <div className="mt-auto">
          <div className="mb-1 flex items-center justify-between font-mono text-[10px] text-zinc-500">
            <span>
              Day {ns.dayOf} / {ns.totalDays}
            </span>
            <span
              className={onPace ? "text-emerald-400" : "text-amber-400"}
              title="goal progress vs time elapsed"
            >
              {onPace ? "on pace" : "behind pace"}
            </span>
          </div>
          <div className="relative h-1.5 w-full overflow-hidden rounded-full bg-zinc-800">
            {/* elapsed-time marker */}
            <div
              className="absolute inset-y-0 left-0 rounded-full bg-zinc-700"
              style={{ width: `${timePct}%` }}
            />
            {/* actual progress on top */}
            <div
              className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-blue-500 to-emerald-500"
              style={{ width: `${pct}%` }}
            />
          </div>
          <div className="mt-1.5 text-center font-mono text-[11px] tabular-nums text-zinc-400">
            <span className="text-zinc-200">{ns.daysLeft}</span> day
            {ns.daysLeft === 1 ? "" : "s"} left
          </div>
        </div>
      </div>
    </Zone>
  );
}

// A clean SVG semicircle gauge — fills clockwise with progress.
function ProgressArc({ pct }: { pct: number }) {
  const r = 46;
  const cx = 60;
  const cy = 56;
  // semicircle from 180° (left) to 0° (right)
  const start = polar(cx, cy, r, 180);
  const end = polar(cx, cy, r, 0);
  const angle = 180 - (pct / 100) * 180;
  const progEnd = polar(cx, cy, r, angle);
  const largeArc = 0; // never exceeds 180°
  const trackPath = `M${start.x} ${start.y} A${r} ${r} 0 0 1 ${end.x} ${end.y}`;
  const progPath = `M${start.x} ${start.y} A${r} ${r} 0 ${largeArc} 1 ${progEnd.x} ${progEnd.y}`;

  return (
    <svg viewBox="0 0 120 64" className="h-16 w-full max-w-[180px]" role="img" aria-hidden>
      <defs>
        <linearGradient id="ns-arc" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#3b82f6" />
          <stop offset="100%" stopColor="#10b981" />
        </linearGradient>
      </defs>
      <path d={trackPath} fill="none" stroke="#27272a" strokeWidth={7} strokeLinecap="round" />
      {pct > 0 && (
        <path
          d={progPath}
          fill="none"
          stroke="url(#ns-arc)"
          strokeWidth={7}
          strokeLinecap="round"
        />
      )}
      <text
        x={cx}
        y={cy - 6}
        textAnchor="middle"
        className="fill-zinc-200 font-mono"
        style={{ fontSize: 15, fontWeight: 600 }}
      >
        {pct}%
      </text>
    </svg>
  );
}

function polar(cx: number, cy: number, r: number, deg: number) {
  const rad = (deg * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy - r * Math.sin(rad) };
}
