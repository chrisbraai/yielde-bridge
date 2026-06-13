import {
  getDayState,
  getRecentHistory,
  type DayState,
  type DayHistoryEntry,
  type DayStatus,
} from "@/lib/day";

export const dynamic = "force-dynamic";

// The Day room — Chris's personal daily advisor dashboard. Single screen, calm and premium.
// Its whole job: make him feel the pull of ONE clear directive and a streak he won't break.
// Pure SERVER component — no client JS. Read-only over `~/.claude/day/data/`.

// ── date helpers (string-based to dodge timezone drift on YYYY-MM-DD values) ──────────────────

const MS_PER_DAY = 86_400_000;

/** Parse YYYY-MM-DD into a UTC-noon Date (noon avoids DST edge flips). Returns null if unparseable. */
function parseYmd(ymd: string | null | undefined): Date | null {
  if (!ymd) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(ymd);
  if (!m) return null;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12));
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Format a Date as a local YYYY-MM-DD (used to derive the server "today" anchor). */
function toYmd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Whole days from a→b (b - a). */
function daysBetween(a: Date, b: Date): number {
  return Math.round((b.getTime() - a.getTime()) / MS_PER_DAY);
}

function addDays(ymd: string, delta: number): string {
  const d = parseYmd(ymd);
  if (!d) return ymd;
  return toYmd(new Date(d.getTime() + delta * MS_PER_DAY));
}

const WEEKDAY_LETTER = ["S", "M", "T", "W", "T", "F", "S"]; // index by getUTCDay()

function weekdayLetter(ymd: string): string {
  const d = parseYmd(ymd);
  return d ? WEEKDAY_LETTER[d.getUTCDay()] : "·";
}

// ── status vocabulary ──────────────────────────────────────────────────────────────────────────

const STATUS_DOT: Record<DayStatus, string> = {
  done: "bg-emerald-500 border-emerald-400 shadow-[0_0_10px_-1px] shadow-emerald-500/50",
  partial: "bg-amber-500/80 border-amber-400",
  missed: "bg-zinc-700 border-zinc-600",
  pending: "bg-transparent border-zinc-700",
};

// ── page ─────────────────────────────────────────────────────────────────────────────────────

export default async function DayPage() {
  const [state, history] = await Promise.all([getDayState(), getRecentHistory(60)]);

  if (!state.initialized) {
    return <Onboarding />;
  }

  return (
    <div className="max-w-3xl mx-auto px-6 py-10 md:py-14">
      <Hero state={state} />
      <WeekLeverCard state={state} />
      <StreakBlock state={state} />
      <NorthStarBlock state={state} />
      <LastSevenDays state={state} history={history} />
      <TomorrowPeek state={state} />
      <Footer />
    </div>
  );
}

// ── HERO: today's one directive ──────────────────────────────────────────────────────────────

function Hero({ state }: { state: DayState }) {
  const { today } = state;
  const isDone = today.status === "done";

  if (!today.directive) {
    return (
      <section className="mb-8">
        <Kicker>Today</Kicker>
        <div className="mt-3 rounded-2xl border border-zinc-800 bg-zinc-950 px-8 py-12 text-center">
          <div className="text-2xl md:text-3xl font-semibold text-zinc-300 leading-snug">
            No directive yet.
          </div>
          <p className="mt-3 text-sm text-zinc-500">
            Run{" "}
            <code className="px-1.5 py-0.5 rounded bg-zinc-900 border border-zinc-800 font-mono text-zinc-300">
              /day
            </code>{" "}
            in your terminal to set today&apos;s one thing.
          </p>
        </div>
      </section>
    );
  }

  return (
    <section className="mb-8">
      <div className="flex items-center justify-between">
        <Kicker>Today&apos;s one thing</Kicker>
        {isDone ? (
          <span className="inline-flex items-center gap-1.5 text-xs font-mono text-emerald-400">
            <span aria-hidden>✓</span> done
          </span>
        ) : (
          <span className="text-xs font-mono text-zinc-600">in focus</span>
        )}
      </div>

      <div
        className={
          "mt-3 rounded-2xl border px-8 py-9 transition-colors " +
          (isDone
            ? "border-emerald-800/60 bg-emerald-950/20 shadow-[0_0_50px_-12px] shadow-emerald-900/60"
            : "border-zinc-800 bg-gradient-to-b from-zinc-900/60 to-zinc-950")
        }
      >
        <h1
          className={
            "text-3xl md:text-[2.6rem] md:leading-[1.15] font-semibold tracking-tight " +
            (isDone ? "text-emerald-50" : "text-zinc-50")
          }
        >
          {isDone && <span className="text-emerald-400 mr-2">✓</span>}
          {today.directive}
        </h1>

        {today.sprintMove && (
          <p className="mt-6 text-base md:text-lg text-zinc-300 leading-relaxed">
            <span className="text-zinc-500 font-mono text-sm mr-1">🌅 5am sprint (70 min):</span>{" "}
            {today.sprintMove}
          </p>
        )}

        {today.rationale && (
          <p className="mt-3 text-sm md:text-base text-zinc-400 leading-relaxed">
            <span className="text-blue-400/90 font-mono text-xs mr-1">
              → why this = a paying client:
            </span>{" "}
            {today.rationale}
          </p>
        )}

        {isDone && today.journal && (
          <p className="mt-6 pt-5 border-t border-emerald-900/40 text-sm text-emerald-100/70 italic leading-relaxed">
            “{today.journal}”
          </p>
        )}
      </div>
    </section>
  );
}

// ── This week's lever (quiet context card; hidden when empty) ─────────────────────────────────

function WeekLeverCard({ state }: { state: DayState }) {
  const text = state.weekLever?.text?.trim();
  if (!text) return null;
  return (
    <section className="mb-8 -mt-3">
      <div className="rounded-xl border border-zinc-800/80 bg-zinc-900/30 px-5 py-3">
        <div className="text-[11px] uppercase tracking-wider text-zinc-500 font-mono">
          This week&apos;s lever
        </div>
        <div className="mt-1 text-sm text-zinc-300 leading-relaxed">{text}</div>
      </div>
    </section>
  );
}

// ── Streak ───────────────────────────────────────────────────────────────────────────────────

function StreakBlock({ state }: { state: DayState }) {
  const { current, longest } = state.streak;
  return (
    <section className="mb-8">
      <div className="flex items-end justify-between rounded-xl border border-zinc-800 bg-zinc-950 px-6 py-5">
        <div className="flex items-baseline gap-3">
          <span className="text-4xl md:text-5xl leading-none" aria-hidden>
            🔥
          </span>
          <div>
            <div className="flex items-baseline gap-2">
              <span className="text-4xl md:text-5xl font-semibold tabular-nums text-zinc-50 leading-none">
                {current}
              </span>
              <span className="text-sm text-zinc-500">
                day{current === 1 ? "" : "s"}
              </span>
            </div>
            <div className="mt-1.5 text-[11px] uppercase tracking-wider text-zinc-500 font-mono">
              showing-up streak · never miss twice
            </div>
          </div>
        </div>
        <div className="text-right">
          <div className="text-lg font-mono tabular-nums text-zinc-300">{longest}</div>
          <div className="text-[11px] uppercase tracking-wider text-zinc-600 font-mono">best</div>
        </div>
      </div>
    </section>
  );
}

// ── North Star ───────────────────────────────────────────────────────────────────────────────

function NorthStarBlock({ state }: { state: DayState }) {
  const ns = state.northStar;
  if (!ns) return null;

  // Day X of N + days remaining, computed at request time against the server clock.
  const start = parseYmd(ns.startDate);
  const end = parseYmd(ns.targetDate);
  const now = parseYmd(toYmd(new Date())); // server "today" normalized to UTC-noon for clean diffs

  const totalDays = start && end ? Math.max(1, daysBetween(start, end)) : null;
  let dayIndex: number | null = null;
  let daysRemaining: number | null = null;
  if (start && end && now) {
    dayIndex = Math.min(Math.max(daysBetween(start, now) + 1, 1), (totalDays ?? 0) + 1);
    daysRemaining = Math.max(daysBetween(now, end), 0);
  }

  const target = ns.target || 1;
  const pct = Math.min(100, Math.max(0, Math.round((ns.current / target) * 100)));

  return (
    <section className="mb-8">
      <div className="rounded-xl border border-zinc-800 bg-zinc-950 px-6 py-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-blue-500" aria-hidden>
              ◆
            </span>
            <span className="text-[11px] uppercase tracking-wider text-zinc-500 font-mono">
              North Star
            </span>
          </div>
          {totalDays !== null && dayIndex !== null && (
            <span className="text-xs font-mono text-zinc-500">
              Day {dayIndex} of {totalDays}
            </span>
          )}
        </div>

        <div className="mt-2 flex items-baseline justify-between">
          <h2 className="text-xl md:text-2xl font-semibold text-zinc-100">{ns.goal}</h2>
          <div className="font-mono tabular-nums text-zinc-300">
            <span className="text-2xl text-zinc-50">{ns.current}</span>
            <span className="text-zinc-600"> / {ns.target}</span>
          </div>
        </div>

        {/* slim progress bar */}
        <div className="mt-4 h-2 w-full rounded-full bg-zinc-800 overflow-hidden">
          <div
            className="h-full rounded-full bg-gradient-to-r from-blue-500 to-emerald-500 transition-all"
            style={{ width: `${pct}%` }}
          />
        </div>

        <div className="mt-2 flex items-center justify-between text-xs text-zinc-500 font-mono">
          <span>{pct}% there</span>
          {daysRemaining !== null && (
            <span>
              {daysRemaining} day{daysRemaining === 1 ? "" : "s"} left
            </span>
          )}
        </div>
      </div>
    </section>
  );
}

// ── Last 7 days strip ────────────────────────────────────────────────────────────────────────

function LastSevenDays({
  state,
  history,
}: {
  state: DayState;
  history: DayHistoryEntry[];
}) {
  // Anchor the strip on the engine's notion of "today" when present (the data may be ahead of the
  // wall clock during seeding), else the server clock. The strip always ends on today.
  const anchor = state.today.date ?? toYmd(new Date());

  const byDate = new Map<string, DayHistoryEntry>();
  for (const h of history) byDate.set(h.date, h);

  // Treat today's live status as authoritative for the last cell even before it lands in history.
  const todayLive: DayHistoryEntry | null =
    state.today.date && state.today.directive !== undefined
      ? {
          date: state.today.date,
          directive: state.today.directive,
          sprintMove: state.today.sprintMove,
          rationale: state.today.rationale,
          status: state.today.status,
          journal: state.today.journal,
          closedAt: state.today.eveningClosedAt,
        }
      : null;

  const cells = Array.from({ length: 7 }, (_, i) => {
    const date = addDays(anchor, i - 6); // oldest → newest, today last
    const entry = date === anchor && todayLive ? todayLive : byDate.get(date) ?? null;
    const status: DayStatus | null = entry ? entry.status : null;
    const isToday = date === anchor;
    const tip = entry
      ? `${date} · ${entry.status}${entry.directive ? ` · ${entry.directive}` : ""}`
      : `${date} · no entry`;
    return { date, status, isToday, tip };
  });

  return (
    <section className="mb-8">
      <div className="text-[11px] uppercase tracking-wider text-zinc-500 font-mono mb-3">
        Last 7 days
      </div>
      <div className="grid grid-cols-7 gap-2.5">
        {cells.map((c) => (
          <div key={c.date} className="flex flex-col items-center gap-1.5" title={c.tip}>
            <div
              className={
                "h-10 w-full rounded-lg border flex items-center justify-center " +
                (c.status ? STATUS_DOT[c.status] : "border-zinc-800 border-dashed bg-transparent") +
                (c.isToday ? " ring-2 ring-zinc-600 ring-offset-2 ring-offset-zinc-950" : "")
              }
            >
              {c.status === "done" && <span className="text-emerald-950 text-sm">✓</span>}
              {c.status === "missed" && <span className="text-zinc-500 text-xs">·</span>}
            </div>
            <span
              className={
                "text-[11px] font-mono " + (c.isToday ? "text-zinc-300" : "text-zinc-600")
              }
            >
              {weekdayLetter(c.date)}
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}

// ── Tomorrow peek (only if pre-set) ──────────────────────────────────────────────────────────

function TomorrowPeek({ state }: { state: DayState }) {
  const tm = state.tomorrow;
  if (!tm || !tm.directive) return null;
  return (
    <section className="mb-8">
      <div className="rounded-xl border border-zinc-800/60 bg-zinc-900/20 px-5 py-3">
        <div className="text-[11px] uppercase tracking-wider text-zinc-600 font-mono">
          Tomorrow, already chosen
        </div>
        <div className="mt-1 text-sm text-zinc-400 leading-relaxed">{tm.directive}</div>
      </div>
    </section>
  );
}

// ── Onboarding (no state yet) ────────────────────────────────────────────────────────────────

function Onboarding() {
  return (
    <div className="max-w-2xl mx-auto px-6 py-24 text-center">
      <div className="text-blue-500 text-2xl mb-4" aria-hidden>
        ◆
      </div>
      <h1 className="text-3xl md:text-4xl font-semibold tracking-tight text-zinc-100">
        Your Day starts here.
      </h1>
      <p className="mt-4 text-base text-zinc-400 leading-relaxed">
        One directive a day. A streak you won&apos;t break. A North Star you keep walking toward.
      </p>
      <div className="mt-8 inline-flex flex-col items-center gap-2">
        <code className="px-3 py-1.5 rounded-lg bg-zinc-900 border border-zinc-800 font-mono text-zinc-200">
          /day
        </code>
        <span className="text-xs text-zinc-600">
          run it in your terminal to set today&apos;s one thing
        </span>
      </div>
      <Footer />
    </div>
  );
}

// ── Footer ───────────────────────────────────────────────────────────────────────────────────

function Footer() {
  return (
    <footer className="mt-12 pt-6 border-t border-zinc-900 text-center">
      <p className="text-xs text-zinc-600 font-mono">
        powered by /day · updates when you run the ritual in Claude Code
      </p>
    </footer>
  );
}

// ── small bits ───────────────────────────────────────────────────────────────────────────────

function Kicker({ children }: { children: React.ReactNode }) {
  return (
    <span className="text-[11px] uppercase tracking-wider text-zinc-500 font-mono">{children}</span>
  );
}
