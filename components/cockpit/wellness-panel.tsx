import type { HealthDomain } from "@/lib/cockpit/types";
import { SectionHeader } from "./consistency-board";

// ── Wellness — workout split + diet plan, honestly ──────────────────────────────────────────────
//
// Reads wellness.workout/diet: planSummary (currently editable placeholder text), lastNote, and the
// current streak. The planSummary is rendered verbatim — when it's empty we say so plainly and tell
// Chris exactly how to set it (the evening ritual / the advisor / `day health-plan`) rather than
// inventing a plan. Pure server markup.

const SET_HINT = "set via the evening ritual, just tell the advisor, or `day health-plan`";

export function WellnessPanel({ wellness }: { wellness: HealthDomain }) {
  return (
    <section className="flex flex-col gap-3">
      <SectionHeader
        kicker="Wellness"
        title="Body — workout & diet"
        note="kept distinct from system health"
      />
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        <DomainCard
          glyph="💪"
          label="Workout"
          accent="text-amber-300"
          streak={wellness.workout.streak.current}
          longest={wellness.workout.streak.longest}
          adherencePct={wellness.workout.streak.adherencePct}
          planSummary={wellness.workout.planSummary}
          lastNote={wellness.workout.lastNote}
          planLabel="split"
        />
        <DomainCard
          glyph="🥗"
          label="Diet"
          accent="text-emerald-300"
          streak={wellness.diet.streak.current}
          longest={wellness.diet.streak.longest}
          adherencePct={wellness.diet.streak.adherencePct}
          planSummary={wellness.diet.planSummary}
          lastNote={wellness.diet.lastNote}
          planLabel="plan"
        />
      </div>
    </section>
  );
}

function DomainCard({
  glyph,
  label,
  accent,
  streak,
  longest,
  adherencePct,
  planSummary,
  lastNote,
  planLabel,
}: {
  glyph: string;
  label: string;
  accent: string;
  streak: number;
  longest: number;
  adherencePct: number | null;
  planSummary: string | null;
  lastNote: string | null;
  planLabel: string;
}) {
  const alive = streak > 0;
  return (
    <div className="flex flex-col gap-3 rounded-xl border border-zinc-800/80 bg-gradient-to-b from-zinc-900/40 to-zinc-950 p-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span aria-hidden className="text-base leading-none">
            {glyph}
          </span>
          <span className={`font-mono text-[13px] font-medium ${accent}`}>{label}</span>
        </div>
        <div className="flex items-baseline gap-1.5" title="current streak · best">
          <span aria-hidden>{alive ? "🔥" : ""}</span>
          <span
            className={
              "font-mono text-xl font-bold tabular-nums " +
              (alive ? "text-emerald-300" : "text-zinc-500")
            }
          >
            {streak}
          </span>
          <span className="font-mono text-[10px] uppercase tracking-wider text-zinc-600">
            best {longest}
            {adherencePct != null ? ` · ${adherencePct}%` : ""}
          </span>
        </div>
      </div>

      {/* the plan summary — rendered honestly */}
      <div className="flex flex-col gap-1">
        <span className="font-mono text-[9px] uppercase tracking-wider text-zinc-600">
          {planLabel}
        </span>
        {planSummary && planSummary.trim().length > 0 ? (
          <p className="whitespace-pre-line text-[12.5px] leading-relaxed text-zinc-300">
            {planSummary}
          </p>
        ) : (
          <div className="rounded-lg border border-dashed border-zinc-800/80 px-3 py-2.5">
            <p className="text-[12px] text-zinc-500">No {planLabel} set yet.</p>
            <p className="mt-1 font-mono text-[10px] text-zinc-600">{SET_HINT}</p>
          </div>
        )}
      </div>

      {/* last note */}
      <div className="mt-auto flex flex-col gap-1 border-t border-zinc-900 pt-2">
        <span className="font-mono text-[9px] uppercase tracking-wider text-zinc-600">
          last note
        </span>
        {lastNote && lastNote.trim().length > 0 ? (
          <p className="text-[12px] italic leading-relaxed text-zinc-400">“{lastNote}”</p>
        ) : (
          <span className="font-mono text-[11px] text-zinc-700">none logged</span>
        )}
      </div>
    </div>
  );
}
