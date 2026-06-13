import type { ConsistencyStreak, ConsistencyKey } from "@/lib/cockpit/types";
import { Kicker } from "./primitives";

// ── Consistency board — the four lanes (Ship · Showing up · Workout · Diet) ─────────────────────
//
// The centrepiece of the "consistency" theme. ONE streak mechanic across four domains, each a card:
//   - big `current` with a 🔥 when it's alive,
//   - `longest` best,
//   - a 14-day dot history (emerald=hit, dim zinc=miss, hollow outline=null/no-data; idx13=today),
//   - `adherencePct` where present.
// Honest empty state: with everything at 0 the cards read "not started yet" rather than faking heat.
//
// Pure server markup — props in, SVG/markup out. The snapshot guarantees exactly 4 lanes in the
// order ship · ritual · workout · diet, but we defend against a short/empty array anyway.

const ORDER: ConsistencyKey[] = ["ship", "ritual", "workout", "diet"];

const LANE_META: Record<
  ConsistencyKey,
  { glyph: string; blurb: string; accent: string }
> = {
  ship: { glyph: "🚀", blurb: "deploys to prod", accent: "text-blue-300" },
  ritual: { glyph: "🌙", blurb: "evening closed", accent: "text-violet-300" },
  workout: { glyph: "💪", blurb: "training logged", accent: "text-amber-300" },
  diet: { glyph: "🥗", blurb: "on plan", accent: "text-emerald-300" },
};

export function ConsistencyBoard({ lanes }: { lanes: ConsistencyStreak[] }) {
  // Normalise to the canonical 4-lane order; tolerate a missing/short array defensively.
  const byKey = new Map(lanes.map((l) => [l.key, l]));
  const ordered = ORDER.map(
    (k) =>
      byKey.get(k) ?? {
        key: k,
        label: k === "ritual" ? "Showing up" : k[0]!.toUpperCase() + k.slice(1),
        current: 0,
        longest: 0,
        lastDate: null,
        history14: new Array<boolean | null>(14).fill(null),
        adherencePct: null,
      },
  );

  const anyAlive = ordered.some((l) => l.current > 0 || l.longest > 0);

  return (
    <section className="flex flex-col gap-3">
      <SectionHeader
        kicker="Consistency"
        title="Four lanes, one streak"
        note={
          anyAlive
            ? "never-miss-twice forgiveness · 14-day history, today on the right"
            : "nothing logged yet — the first hit starts every streak"
        }
      />

      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        {ordered.map((lane) => (
          <LaneCard key={lane.key} lane={lane} />
        ))}
      </div>
    </section>
  );
}

function LaneCard({ lane }: { lane: ConsistencyStreak }) {
  const meta = LANE_META[lane.key];
  const alive = lane.current > 0;
  const cardTone = alive
    ? "border-emerald-900/40 bg-gradient-to-b from-emerald-950/15 to-zinc-950"
    : "border-zinc-800/80 bg-gradient-to-b from-zinc-900/40 to-zinc-950";

  return (
    <div className={`flex flex-col gap-3 rounded-xl border p-4 ${cardTone}`}>
      {/* header: glyph + label + blurb */}
      <div className="flex items-center gap-2">
        <span aria-hidden className="text-base leading-none">
          {meta.glyph}
        </span>
        <div className="flex min-w-0 flex-col">
          <span className={`font-mono text-[12px] font-medium ${meta.accent}`}>{lane.label}</span>
          <span className="font-mono text-[9px] uppercase tracking-wider text-zinc-600">
            {meta.blurb}
          </span>
        </div>
      </div>

      {/* big current + longest */}
      <div className="flex items-end justify-between">
        <div className="flex items-baseline gap-1.5">
          <span aria-hidden className="text-xl leading-none">
            {alive ? "🔥" : ""}
          </span>
          <span
            className={
              "font-mono text-4xl font-bold leading-none tabular-nums " +
              (alive ? "text-emerald-300" : "text-zinc-500")
            }
          >
            {lane.current}
          </span>
          <span className="font-mono text-[10px] uppercase tracking-wider text-zinc-600">
            day{lane.current === 1 ? "" : "s"}
          </span>
        </div>
        <div className="flex flex-col items-end">
          <span className="font-mono text-sm font-semibold tabular-nums text-zinc-300">
            {lane.longest}
          </span>
          <span className="font-mono text-[9px] uppercase tracking-wider text-zinc-600">best</span>
        </div>
      </div>

      {/* 14-day dot history */}
      <div className="flex flex-col gap-1">
        <DotHistory history={lane.history14} />
        <div className="flex items-center justify-between">
          <span className="font-mono text-[9px] text-zinc-700">14d · today →</span>
          {lane.adherencePct != null ? (
            <span className="font-mono text-[10px] tabular-nums text-zinc-500">
              {lane.adherencePct}% adherence
            </span>
          ) : lane.lastDate ? (
            <span className="font-mono text-[10px] text-zinc-600">last {lane.lastDate}</span>
          ) : (
            <span className="font-mono text-[10px] text-zinc-700">no hits</span>
          )}
        </div>
      </div>
    </div>
  );
}

// 14 cells, oldest -> newest. emerald = hit, dim zinc = miss, hollow ring = null (untracked).
function DotHistory({ history }: { history: (boolean | null)[] }) {
  const cells = history.length === 14 ? history : new Array<boolean | null>(14).fill(null);
  return (
    <div className="flex items-center gap-[3px]" aria-hidden>
      {cells.map((v, i) => {
        const isToday = i === 13;
        const base = "h-3.5 flex-1 rounded-[2px] ";
        const fill =
          v === true
            ? "bg-emerald-500/80"
            : v === false
              ? "bg-zinc-800"
              : "border border-dashed border-zinc-800 bg-transparent";
        const ring = isToday && v !== null ? " ring-1 ring-inset ring-zinc-500/40" : "";
        return <span key={i} className={base + fill + ring} />;
      })}
    </div>
  );
}

// Shared calm section header (kicker + title + note) used by every scroll section below the fold.
export function SectionHeader({
  kicker,
  title,
  note,
}: {
  kicker: string;
  title: string;
  note?: string;
}) {
  return (
    <header className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b border-zinc-900 pb-2">
      <div className="flex items-baseline gap-3">
        <Kicker>{kicker}</Kicker>
        <h2 className="font-mono text-sm font-medium tracking-tight text-zinc-200">{title}</h2>
      </div>
      {note != null && <span className="font-mono text-[10px] text-zinc-600">{note}</span>}
    </header>
  );
}
