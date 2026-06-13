import type { BuildShip, ShipStreak, PrItem } from "@/lib/cockpit/types";
import { Kicker, Sparkline } from "./primitives";

// CENTER HERO — the biggest, highest-contrast zone, and the conscience of the cockpit. It answers
// one question at a glance: "you BUILT a lot — did you SHIP any of it?" The DAYS-SINCE-DEPLOY number
// is the one honest figure that's allowed to sting. Everything stays calm until the build/ship gap
// goes unhealthy, then color intrudes (the page-level desaturation is applied by the page wrapper
// using `isUnhealthy` derived here and re-derived there — kept identical).
//
// Honest empty states: nothing shipped yet → daysSinceDeploy null, cadence all-zero, streak 0. We
// say "NEVER SHIPPED" plainly and never invent a number.

export function buildShipUnhealthy(bs: BuildShip): boolean {
  // The gap is unhealthy when work is piling up unshipped, or it's been too long since a deploy.
  const staleDeploy = bs.daysSinceDeploy != null && bs.daysSinceDeploy > 3;
  const builtNotShipped = bs.builtOpen > 0 && bs.shippedThisWeek === 0;
  return staleDeploy || builtNotShipped;
}

function daysTone(d: number | null): "muted" | "good" | "warn" | "danger" {
  if (d == null) return "muted";
  if (d > 7) return "danger";
  if (d > 3) return "warn";
  return "good";
}

const TONE_TEXT: Record<string, string> = {
  muted: "text-zinc-500",
  good: "text-emerald-400",
  warn: "text-amber-400",
  danger: "text-rose-400",
};
const TONE_GLOW: Record<string, string> = {
  muted: "",
  good: "drop-shadow-[0_0_22px_rgba(16,185,129,0.25)]",
  warn: "drop-shadow-[0_0_22px_rgba(245,158,11,0.30)]",
  danger: "drop-shadow-[0_0_26px_rgba(244,63,94,0.40)]",
};

export function BuildShipHero({
  buildShip,
  shipStreak,
}: {
  buildShip: BuildShip;
  shipStreak: ShipStreak;
}) {
  const bs = buildShip;
  const neverShipped = bs.daysSinceDeploy == null;
  const tone = daysTone(bs.daysSinceDeploy);
  const cadenceMax = Math.max(0, ...bs.deployCadence14);

  // The build glyph row: filled blocks for open/built work, capped so it never overflows.
  const builtBlocks = Math.min(bs.builtOpen, 12);

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 rounded-xl border border-zinc-800/80 bg-gradient-to-b from-zinc-900/50 to-zinc-950 p-4">
      {/* header */}
      <div className="flex shrink-0 items-center justify-between">
        <Kicker tone="accent">Build vs Ship</Kicker>
        <span className="font-mono text-[10px] uppercase tracking-wider text-zinc-600">
          the conscience
        </span>
      </div>

      {/* built ▣▣▣ · shipped line */}
      <div className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-1">
        <span className="font-mono text-2xl font-semibold tabular-nums text-zinc-50">
          {bs.builtOpen}
        </span>
        <span className="font-mono text-sm text-zinc-500">built</span>
        <span className="flex items-center gap-[3px]" aria-hidden>
          {Array.from({ length: builtBlocks }).map((_, i) => (
            <span
              key={i}
              className="inline-block h-3.5 w-2.5 rounded-[2px] bg-blue-500/70"
            />
          ))}
          {bs.builtOpen > 12 && (
            <span className="ml-1 font-mono text-[10px] text-zinc-500">+{bs.builtOpen - 12}</span>
          )}
        </span>
        <span className="mx-1 text-zinc-700">·</span>
        <span
          className={
            "font-mono text-2xl font-semibold tabular-nums " +
            (bs.shippedThisWeek > 0 ? "text-emerald-400" : "text-rose-400")
          }
        >
          {bs.shippedThisWeek}
        </span>
        <span className="font-mono text-sm text-zinc-500">shipped this week</span>
      </div>

      {/* THE stinging number */}
      <div className="flex min-h-0 flex-1 items-center justify-between gap-4">
        <div className="flex flex-col">
          <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-zinc-600">
            {neverShipped ? "deploy status" : "days since deploy"}
          </span>
          {neverShipped ? (
            <div className="mt-1">
              <span className="font-mono text-4xl font-bold tracking-tight text-zinc-300">
                NEVER
              </span>
              <span className="ml-2 font-mono text-4xl font-bold tracking-tight text-zinc-600">
                SHIPPED
              </span>
              <p className="mt-2 max-w-md font-mono text-[11px] leading-relaxed text-zinc-500">
                no deploy events recorded yet. ship something to start the streak — the number that
                lives here is the one that&apos;s allowed to sting.
              </p>
            </div>
          ) : (
            <div className="mt-1 flex items-baseline gap-3">
              <span
                className={`font-mono text-[5.5rem] font-bold leading-[0.85] tabular-nums tracking-tighter ${TONE_TEXT[tone]} ${TONE_GLOW[tone]}`}
              >
                {bs.daysSinceDeploy}
              </span>
              <span className="font-mono text-base text-zinc-500">
                day{bs.daysSinceDeploy === 1 ? "" : "s"}
              </span>
            </div>
          )}
        </div>

        {/* streak + lead time, right-aligned */}
        <div className="flex shrink-0 flex-col items-end gap-2 text-right">
          <div>
            <div className="flex items-baseline justify-end gap-1.5">
              <span aria-hidden className="text-lg">
                {shipStreak.current > 0 ? "🔥" : ""}
              </span>
              <span className="font-mono text-2xl font-semibold tabular-nums text-zinc-100">
                {shipStreak.current}
              </span>
            </div>
            <div className="font-mono text-[10px] uppercase tracking-wider text-zinc-600">
              ship streak · best {shipStreak.longest}
            </div>
          </div>
          {bs.leadTimeDays != null && (
            <div>
              <span className="font-mono text-base tabular-nums text-zinc-300">
                {bs.leadTimeDays}d
              </span>
              <div className="font-mono text-[10px] uppercase tracking-wider text-zinc-600">
                lead time
              </div>
            </div>
          )}
        </div>
      </div>

      {/* 14-day deploy cadence sparkline */}
      <div className="shrink-0">
        <div className="mb-1 flex items-center justify-between">
          <span className="font-mono text-[10px] uppercase tracking-wider text-zinc-600">
            deploy cadence · 14d
          </span>
          <span className="font-mono text-[10px] text-zinc-600">
            {cadenceMax === 0 ? "flatline — no deploys" : `peak ${cadenceMax}/day`}
          </span>
        </div>
        <Sparkline
          data={bs.deployCadence14}
          width={420}
          height={34}
          stroke={cadenceMax === 0 ? "#52525b" : "#10b981"}
          fill="#10b981"
          markLast
          className="h-[34px] w-full"
        />
      </div>

      {/* oldest unshipped PRs */}
      <div className="flex min-h-0 shrink-0 flex-col gap-1.5">
        <div className="flex items-center justify-between">
          <span className="font-mono text-[10px] uppercase tracking-wider text-zinc-600">
            unshipped · oldest first
          </span>
          <span className="font-mono text-[10px] text-zinc-600">
            {bs.ready} ready · {bs.draft} draft
          </span>
        </div>
        {bs.prs.length === 0 ? (
          <div className="rounded-lg border border-dashed border-zinc-800/80 px-3 py-2 text-center font-mono text-[11px] text-zinc-600">
            no open PRs — clean tree
          </div>
        ) : (
          <ul className="flex flex-col gap-1">
            {bs.prs.slice(0, 4).map((pr) => (
              <PrRow key={`${pr.repo}#${pr.number}`} pr={pr} />
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function PrRow({ pr }: { pr: PrItem }) {
  const ageTone =
    pr.ageDays >= 14 ? "text-rose-400" : pr.ageDays >= 7 ? "text-amber-400" : "text-zinc-500";
  const repoShort = pr.repo.split("/").pop() ?? pr.repo;
  return (
    <li className="flex items-center gap-2 rounded-md border border-zinc-800/70 bg-zinc-900/40 px-2.5 py-1.5">
      <span
        className={
          "shrink-0 rounded px-1.5 py-0.5 font-mono text-[9px] " +
          (pr.isDraft
            ? "border border-zinc-700 bg-zinc-900 text-zinc-500"
            : "border border-emerald-700/50 bg-emerald-900/20 text-emerald-400")
        }
      >
        {pr.isDraft ? "draft" : "ready"}
      </span>
      <span className="shrink-0 font-mono text-[11px] text-zinc-500">
        {repoShort}
        <span className="text-zinc-600">#{pr.number}</span>
      </span>
      <span className="min-w-0 flex-1 truncate text-[12px] text-zinc-300" title={pr.title}>
        {pr.title}
      </span>
      <span className={`shrink-0 font-mono text-[11px] tabular-nums ${ageTone}`}>
        {pr.ageDays}d
      </span>
    </li>
  );
}
