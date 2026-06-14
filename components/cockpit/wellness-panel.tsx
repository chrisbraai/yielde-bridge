import type { HealthDomain, WorkoutSession, DietMacros } from "@/lib/cockpit/types";
import { SectionHeader } from "./consistency-board";

// ── Wellness — TODAY's training session + TODAY's macro targets, from the structured plan ────────
//
// The panel sits below the fold in the cockpit's HEALTH section and is meant to be genuinely useful
// to glance at before training. Two columns:
//   - TODAY'S SESSION (hero): the dated powerlifting session for today — label + program + every
//     exercise as a row of compact set chips. Rest day → a calm "no session" with the next peek.
//   - TODAY'S MACROS: four prominent stat cells (kcal · protein · carbs · fat) for the local
//     weekday, plus a 7-column mon→sun kcal strip with today ringed.
// Streaks (workout + diet) and the last note ride along compactly. When no structured plan exists
// at all, we fall back to the honest planSummary placeholder rather than inventing a plan.
//
// Pure server markup — props in, markup out. No data fetching, no Date.now() (today is resolved
// server-side by the reader, which hands us todaySession / todayMacros / weekday already).

const WEEKDAY_LABEL: Record<string, string> = {
  mon: "Mon",
  tue: "Tue",
  wed: "Wed",
  thu: "Thu",
  fri: "Fri",
  sat: "Sat",
  sun: "Sun",
};

export function WellnessPanel({ wellness }: { wellness: HealthDomain }) {
  const w = wellness.workout;
  const d = wellness.diet;

  // "Rich" = a structured plan is present (dated sessions or per-weekday macros). When neither side
  // has any rich data, we render the legacy honest-placeholder cards instead of a bare training view.
  const hasRichWorkout = Boolean(w.program || w.todaySession || w.nextSession);
  const hasRichDiet = Boolean(d.todayMacros || (d.weekMacros && d.weekMacros.length > 0));
  const rich = hasRichWorkout || hasRichDiet;

  return (
    <section className="flex flex-col gap-3">
      <SectionHeader
        kicker="Wellness"
        title={rich ? "Training — today's session & macros" : "Body — workout & diet"}
        note={
          rich
            ? w.program ?? "kept distinct from system health"
            : "kept distinct from system health"
        }
      />

      {rich ? (
        <div className="grid grid-cols-1 gap-3 xl:grid-cols-[1.6fr_1fr]">
          <TodaySessionCard
            session={w.todaySession ?? null}
            next={w.nextSession ?? null}
            program={w.program ?? null}
            streakCurrent={w.streak.current}
            streakLongest={w.streak.longest}
            adherencePct={w.streak.adherencePct}
            lastNote={w.lastNote}
          />
          <TodayMacrosCard
            macros={d.todayMacros ?? null}
            weekday={d.weekday ?? null}
            weekMacros={d.weekMacros ?? null}
            streakCurrent={d.streak.current}
            streakLongest={d.streak.longest}
            adherencePct={d.streak.adherencePct}
            lastNote={d.lastNote}
          />
        </div>
      ) : (
        <FallbackCards wellness={wellness} />
      )}
    </section>
  );
}

// ── TODAY'S SESSION — the hero ───────────────────────────────────────────────────────────────────

function TodaySessionCard({
  session,
  next,
  program,
  streakCurrent,
  streakLongest,
  adherencePct,
  lastNote,
}: {
  session: WorkoutSession | null;
  next: WorkoutSession | null;
  program: string | null;
  streakCurrent: number;
  streakLongest: number;
  adherencePct: number | null;
  lastNote: string | null;
}) {
  const training = session != null;
  const tone = training
    ? "border-amber-900/40 bg-gradient-to-b from-amber-950/15 to-zinc-950"
    : "border-zinc-800/80 bg-gradient-to-b from-zinc-900/40 to-zinc-950";

  return (
    <div className={`flex flex-col gap-3 rounded-xl border p-4 ${tone}`}>
      {/* header */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <span aria-hidden className="text-base leading-none">
            💪
          </span>
          <div className="flex min-w-0 flex-col">
            <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-zinc-600">
              today&apos;s session
            </span>
            <span className="font-mono text-sm font-semibold tracking-tight text-amber-200">
              {training ? session!.label : "Rest day — no session"}
            </span>
          </div>
        </div>
        <StreakPip current={streakCurrent} longest={streakLongest} adherencePct={adherencePct} />
      </div>

      {program && (
        <span className="-mt-1 font-mono text-[10px] uppercase tracking-wider text-zinc-600">
          {program}
        </span>
      )}

      {/* body */}
      {training ? (
        <ul className="flex flex-col gap-1.5">
          {session!.exercises.map((ex, i) => (
            <li
              key={`${ex.name}-${i}`}
              className="flex flex-col gap-1.5 rounded-lg border border-zinc-800/70 bg-zinc-900/40 px-3 py-2 sm:flex-row sm:items-center sm:gap-3"
            >
              <span className="shrink-0 text-[13px] font-semibold text-zinc-100 sm:w-44">
                {ex.name}
              </span>
              <div className="flex flex-wrap items-center gap-1.5">
                {ex.sets.length > 0 ? (
                  ex.sets.map((s, j) => <SetChip key={j} set={s} />)
                ) : (
                  <span className="font-mono text-[11px] text-zinc-600">—</span>
                )}
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <div className="rounded-lg border border-dashed border-zinc-800/80 px-3 py-3">
          <p className="text-[12.5px] text-zinc-400">
            No training programmed for today. Recover well.
          </p>
        </div>
      )}

      {/* next-session peek (always shown when present) + last note */}
      <div className="mt-auto flex flex-wrap items-center justify-between gap-x-4 gap-y-1 border-t border-zinc-900 pt-2">
        {next ? (
          <span className="font-mono text-[11px] text-zinc-500">
            <span className="text-zinc-600">next:</span> {next.label}
            {next.date ? <span className="text-zinc-600"> · {next.date}</span> : null}
          </span>
        ) : (
          <span className="font-mono text-[11px] text-zinc-700">no upcoming session</span>
        )}
        {lastNote && lastNote.trim().length > 0 && (
          <span className="max-w-[55%] truncate text-[11px] italic text-zinc-500" title={lastNote}>
            “{lastNote}”
          </span>
        )}
      </div>
    </div>
  );
}

// A single set rendered crisply: split the weight/percentage so reps×weight stays bold and the
// percentage (or RPE) trails muted. e.g. "3×2 @ 200kg (100%)" -> bold "3×2 200kg" + muted "100%".
function SetChip({ set }: { set: string }) {
  const { main, tail } = splitSet(set);
  return (
    <span className="inline-flex items-baseline gap-1 rounded-md border border-zinc-700/60 bg-zinc-950/60 px-2 py-1">
      <span className="font-mono text-[12px] font-semibold tabular-nums text-zinc-100">{main}</span>
      {tail && (
        <span className="font-mono text-[10px] tabular-nums text-amber-300/80">{tail}</span>
      )}
    </span>
  );
}

// Parse a set string into a crisp main part (reps × weight) and a trailing tag (percentage / RPE).
// Robust to the legacy "@", parenthetical "(100%)", or bare "@ RPE 8" forms; never throws.
export function splitSet(raw: string): { main: string; tail: string | null } {
  const s = raw.trim();
  // Pull a trailing "(...)" percentage tag if present.
  const paren = s.match(/\(([^)]*)\)\s*$/);
  let tail: string | null = paren ? paren[1]!.trim() : null;
  let main = paren ? s.slice(0, paren.index).trim() : s;
  // Normalise "3×2 @ 200kg" -> "3×2 200kg" (drop the @ separator for compactness).
  main = main.replace(/\s*@\s*/g, " ").replace(/\s+/g, " ").trim();
  // If there was no paren tag but the line carries an RPE, surface it as the tail.
  if (!tail) {
    const rpe = main.match(/(RPE\s*\d+(?:\.\d+)?)\s*$/i);
    if (rpe) {
      tail = rpe[1]!.trim();
      main = main.slice(0, rpe.index).trim();
    }
  }
  return { main: main.length > 0 ? main : s, tail };
}

// ── TODAY'S MACROS ───────────────────────────────────────────────────────────────────────────────

function TodayMacrosCard({
  macros,
  weekday,
  weekMacros,
  streakCurrent,
  streakLongest,
  adherencePct,
  lastNote,
}: {
  macros: DietMacros | null;
  weekday: string | null;
  weekMacros: { weekday: string; macros: DietMacros }[] | null;
  streakCurrent: number;
  streakLongest: number;
  adherencePct: number | null;
  lastNote: string | null;
}) {
  const wd = weekday ? WEEKDAY_LABEL[weekday] ?? weekday : null;
  return (
    <div className="flex flex-col gap-3 rounded-xl border border-emerald-900/40 bg-gradient-to-b from-emerald-950/15 to-zinc-950 p-4">
      {/* header */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <span aria-hidden className="text-base leading-none">
            🥗
          </span>
          <div className="flex min-w-0 flex-col">
            <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-zinc-600">
              today&apos;s macros{wd ? ` · ${wd}` : ""}
            </span>
            <span className="font-mono text-sm font-semibold tracking-tight text-emerald-200">
              {macros ? `${macros.kcal} kcal target` : "No macros set"}
            </span>
          </div>
        </div>
        <StreakPip current={streakCurrent} longest={streakLongest} adherencePct={adherencePct} />
      </div>

      {/* four stat cells */}
      {macros ? (
        <div className="grid grid-cols-2 gap-2">
          <MacroCell label="kcal" value={macros.kcal} accent="text-emerald-300" />
          <MacroCell label="protein g" value={macros.protein} accent="text-blue-300" />
          <MacroCell label="carbs g" value={macros.carbs} accent="text-amber-300" />
          <MacroCell label="fat g" value={macros.fat} accent="text-rose-300" />
        </div>
      ) : (
        <div className="rounded-lg border border-dashed border-zinc-800/80 px-3 py-3">
          <p className="text-[12px] text-zinc-500">No macro target for today.</p>
        </div>
      )}

      {/* week strip */}
      {weekMacros && weekMacros.length > 0 && (
        <WeekStrip weekMacros={weekMacros} today={weekday} />
      )}

      {/* last note */}
      <div className="mt-auto flex flex-col gap-1 border-t border-zinc-900 pt-2">
        <span className="font-mono text-[9px] uppercase tracking-wider text-zinc-600">
          last note
        </span>
        {lastNote && lastNote.trim().length > 0 ? (
          <p className="truncate text-[12px] italic text-zinc-400" title={lastNote}>
            “{lastNote}”
          </p>
        ) : (
          <span className="font-mono text-[11px] text-zinc-700">none logged</span>
        )}
      </div>
    </div>
  );
}

function MacroCell({
  label,
  value,
  accent,
}: {
  label: string;
  value: number;
  accent: string;
}) {
  return (
    <div className="flex flex-col gap-0.5 rounded-lg border border-zinc-800/70 bg-zinc-900/40 px-3 py-2.5">
      <span className={`font-mono text-2xl font-bold leading-none tabular-nums ${accent}`}>
        {value}
      </span>
      <span className="font-mono text-[9px] uppercase tracking-wider text-zinc-600">{label}</span>
    </div>
  );
}

// 7 mini columns mon→sun showing kcal, today highlighted/ringed. Bars scaled to the week's max kcal.
function WeekStrip({
  weekMacros,
  today,
}: {
  weekMacros: { weekday: string; macros: DietMacros }[];
  today: string | null;
}) {
  const max = Math.max(1, ...weekMacros.map((x) => x.macros.kcal));
  return (
    <div className="flex flex-col gap-1">
      <span className="font-mono text-[9px] uppercase tracking-wider text-zinc-600">
        kcal · mon → sun
      </span>
      <div className="flex items-end gap-1.5">
        {weekMacros.map((x) => {
          const isToday = x.weekday === today;
          const pct = Math.round((x.macros.kcal / max) * 100);
          return (
            <div key={x.weekday} className="flex flex-1 flex-col items-center gap-1">
              <span
                className={
                  "font-mono text-[9px] tabular-nums " +
                  (isToday ? "text-emerald-300" : "text-zinc-600")
                }
              >
                {x.macros.kcal}
              </span>
              <div className="flex h-10 w-full items-end">
                <div
                  className={
                    "w-full rounded-[2px] " +
                    (isToday ? "bg-emerald-500/80 ring-1 ring-inset ring-emerald-300/50" : "bg-zinc-700")
                  }
                  style={{ height: `${Math.max(8, pct)}%` }}
                />
              </div>
              <span
                className={
                  "font-mono text-[9px] uppercase " +
                  (isToday ? "text-emerald-300" : "text-zinc-600")
                }
              >
                {WEEKDAY_LABEL[x.weekday] ?? x.weekday}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Shared compact streak pip (current 🔥 · best · adherence) ────────────────────────────────────

function StreakPip({
  current,
  longest,
  adherencePct,
}: {
  current: number;
  longest: number;
  adherencePct: number | null;
}) {
  const alive = current > 0;
  return (
    <div className="flex shrink-0 items-baseline gap-1.5" title="current streak · best · adherence">
      <span aria-hidden>{alive ? "🔥" : ""}</span>
      <span
        className={
          "font-mono text-xl font-bold tabular-nums " +
          (alive ? "text-emerald-300" : "text-zinc-500")
        }
      >
        {current}
      </span>
      <span className="font-mono text-[10px] uppercase tracking-wider text-zinc-600">
        best {longest}
        {adherencePct != null ? ` · ${adherencePct}%` : ""}
      </span>
    </div>
  );
}

// ── Fallback (no structured plan) — the original honest placeholder cards ─────────────────────────

const SET_HINT = "set via the evening ritual, just tell the advisor, or `day health-plan`";

function FallbackCards({ wellness }: { wellness: HealthDomain }) {
  return (
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
