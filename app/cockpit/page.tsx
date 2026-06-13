import { getCockpitSnapshot } from "@/lib/cockpit/context";
import { CenterProvider, CockpitCenter } from "@/components/cockpit/cockpit-center";
import { TopRail } from "@/components/cockpit/top-rail";
import { BuildShipHero, buildShipUnhealthy } from "@/components/cockpit/build-ship-hero";
import { NorthStarPanel } from "@/components/cockpit/north-star-panel";
import { GatedPanel } from "@/components/cockpit/gated-panel";
import { BurnPanel } from "@/components/cockpit/burn-panel";
import { FleetPanel } from "@/components/cockpit/fleet-panel";
import { HealthPanel } from "@/components/cockpit/health-panel";
import { AdvisorRail } from "@/components/cockpit/advisor-rail";
import { AdvisorChat } from "@/components/advisor-chat";
import { ConsistencyBoard } from "@/components/cockpit/consistency-board";
import { WellnessPanel } from "@/components/cockpit/wellness-panel";
import { LibraryRails } from "@/components/cockpit/library-rails";
import { ActivityFeeds } from "@/components/cockpit/activity-feeds";
import { EMPTY_CONSISTENCY, EMPTY_WELLNESS } from "@/lib/cockpit/consistency";

export const dynamic = "force-dynamic";

// ── Yielde Command — ONE vertically-scrollable, tab-free canvas ────────────────────────────────
// SERVER component. Reads the single assembled snapshot (getCockpitSnapshot) and lays it out as a
// SCROLL CANVAS, not a fixed screen. Chris doesn't like tabs — he wants to see it all and scroll for
// depth. So the page is one column you scroll:
//
//   FOLD 1 (≈ one viewport) — the command center, untouched in behaviour: thin top status rail, the
//     5-column mission-control body (16 | 18 | 36 HERO | 18 | 12) with <AdvisorChat/> wired into the
//     center stage, and the bottom advisor rail. Sized to ~100vh so it owns the first screen.
//   BELOW THE FOLD — calm scroll sections that fold the rest of the Bridge in:
//     2. Consistency board (ship · showing up · workout · diet streaks)
//     3. Wellness (workout split + diet plan)
//     4. Library rails (Skills / Agents / Scripts / Capabilities — the horizontal "scrollbars")
//     5. Activity feeds (brain drafts · kernel audit · operator runs · webhook deliveries)
//
// Calm by default; anomalies self-highlight. When the build/ship gap is unhealthy the WHOLE canvas
// desaturates slightly so the dysfunction intrudes on the eye without a single number being faked.
//
// Live updating: <TopRail/> mounts <AutoRefresh/>, a client component that calls router.refresh()
// every ~45s to re-run this server page. No Date.now() is called during render here — the only
// clock shown is the snapshot's own `at` timestamp (deterministic) and the client live indicator.

export default async function CockpitPage() {
  const snap = await getCockpitSnapshot();
  const unhealthy = buildShipUnhealthy(snap.buildShip);
  const prodSha = snap.health.deployDrift?.prodSha ?? null;

  // These snapshot fields are optional in the type but always populated at runtime — default
  // defensively so a missing slice renders an honest empty board rather than throwing.
  const consistency = snap.consistency ?? EMPTY_CONSISTENCY;
  const wellness = snap.wellness ?? EMPTY_WELLNESS;

  return (
    <CenterProvider>
      {/* THE scroll canvas. Height is bounded to the viewport-minus-header and `overflow-y-auto` so
          the command center owns the first screen and the new sections flow beneath as you scroll.
          Subtle desaturation + dimming when the build/ship gap is unhealthy (the anomaly intrudes on
          the whole canvas — the cockpit's conscience). */}
      <div
        className={
          "rail-scroll relative h-[calc(100vh-3.5rem)] w-full overflow-y-auto overflow-x-hidden bg-zinc-950 transition-[filter] duration-700 " +
          (unhealthy ? "[filter:saturate(0.72)_brightness(0.94)]" : "")
        }
      >
        {/* anomaly band: a thin top accent that bleeds in when something is wrong */}
        {unhealthy && (
          <div
            aria-hidden
            className="pointer-events-none absolute inset-x-0 top-14 z-20 h-px bg-gradient-to-r from-transparent via-rose-500/40 to-transparent"
          />
        )}

        {/* ── FOLD 1 — the command center (≈ one viewport). Behaviour preserved verbatim. ──────── */}
        <div className="flex h-[calc(100vh-3.5rem)] w-full flex-col gap-2 p-2">
          {/* ── TOP RAIL ───────────────────────────────────────────────────────────── */}
          <div className="h-11 shrink-0 rounded-xl border border-zinc-800/80 bg-gradient-to-b from-zinc-900/60 to-zinc-950">
            <TopRail
              assembledAt={snap.at}
              health={snap.health}
              errorCount={snap.errors.length}
              prodSha={prodSha}
            />
          </div>

          {/* ── BODY: 5 columns ≈ 16 | 18 | 36 HERO | 18 | 12 ─────────────────────────
              On ultrawide all five sit side-by-side; on narrower screens the grid reflows
              (the hero stays prominent, side columns wrap beneath). */}
          <div className="grid min-h-0 flex-1 grid-cols-2 gap-2 lg:grid-cols-12 xl:[grid-template-columns:16fr_18fr_36fr_18fr_12fr]">
            {/* LEFT-NEAR — North Star */}
            <div className="col-span-1 min-h-0 lg:col-span-3 xl:col-auto">
              <NorthStarPanel northStar={snap.northStar} />
            </div>

            {/* LEFT-FAR — Gated on you */}
            <div className="col-span-1 min-h-0 lg:col-span-3 xl:col-auto">
              <GatedPanel gated={snap.gated} />
            </div>

            {/* CENTER HERO — BuildShip / chat stage (the conscience) */}
            <div className="col-span-2 min-h-0 lg:col-span-6 xl:col-auto">
              <CockpitCenter
                hero={
                  <BuildShipHero buildShip={snap.buildShip} shipStreak={snap.shipStreak} />
                }
                chat={
                  <div className="flex min-h-0 flex-1">
                    <AdvisorChat contextHint="I can see your whole cockpit — ask me what to ship first." />
                  </div>
                }
              />
            </div>

            {/* RIGHT-NEAR — AI Burn */}
            <div className="col-span-1 min-h-0 lg:col-span-3 xl:col-auto">
              <BurnPanel burn={snap.burn} />
            </div>

            {/* RIGHT-FAR — Fleet over System (two stacked zones) */}
            <div className="col-span-1 flex min-h-0 flex-col gap-2 lg:col-span-3 xl:col-auto">
              <FleetPanel fleet={snap.fleet} />
              <HealthPanel health={snap.health} />
            </div>
          </div>

          {/* ── BOTTOM RAIL — Advisor directive + chat toggle ─────────────────────────── */}
          <div className="h-16 shrink-0 rounded-xl border border-zinc-800/80 bg-gradient-to-b from-zinc-900/60 to-zinc-950">
            <AdvisorRail advisor={snap.advisor} />
          </div>

          {/* scroll affordance — a quiet hint the canvas continues below the fold */}
          <ScrollCue />

          {/* ── source-error footer (subtle, surfaced, never hidden) ──────────────────── */}
          <CockpitErrors errors={snap.errors} />
        </div>

        {/* ── BELOW THE FOLD — the rest of the Bridge, folded in as scroll sections ───────────── */}
        <div className="mx-auto flex w-full max-w-[2400px] flex-col gap-10 px-3 pb-16 pt-4 sm:px-5">
          <ConsistencyBoard lanes={consistency} />
          <WellnessPanel wellness={wellness} />
          {/* Library rails + activity feeds read the filesystem / runtime.db directly (force-dynamic). */}
          <LibraryRails />
          <ActivityFeeds />
        </div>
      </div>
    </CenterProvider>
  );
}

// A quiet, centred "scroll for more" cue at the bottom of the command-center fold. Pure markup —
// no JS, no clock. It just tells the eye the canvas keeps going.
function ScrollCue() {
  return (
    <div
      aria-hidden
      className="flex h-4 shrink-0 items-center justify-center gap-1.5 font-mono text-[9px] uppercase tracking-[0.25em] text-zinc-700"
    >
      consistency · wellness · library · activity
      <span className="text-zinc-600">↓</span>
    </div>
  );
}

// Muted footer that surfaces non-fatal source failures. Always rendered (a tiny line even when
// clean) so Chris can trust the screen is being honest about what it couldn't read.
function CockpitErrors({ errors }: { errors: string[] }) {
  return (
    <footer className="h-4 shrink-0 overflow-hidden px-2">
      {errors.length === 0 ? (
        <span className="font-mono text-[9px] text-zinc-700">
          all sources read clean · cockpit honest
        </span>
      ) : (
        <span
          className="block truncate font-mono text-[9px] text-amber-500/70"
          title={errors.join("  |  ")}
        >
          {errors.length} source error{errors.length === 1 ? "" : "s"}: {errors.join("  ·  ")}
        </span>
      )}
    </footer>
  );
}
