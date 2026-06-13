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

export const dynamic = "force-dynamic";

// ── Yielde Command — the ultrawide "Jarvis" mission-control cockpit ────────────────────────────
// SERVER component. Reads the single assembled snapshot (getCockpitSnapshot) and lays it out across
// a full-viewport 21:9 grid: a thin top status rail, a 5-column body (16 | 18 | 36 HERO | 18 | 12),
// and a bottom advisor rail. Built to fill 3440×1440 gracefully and stack on a normal 16:9.
//
// Calm by default; anomalies self-highlight. When the build/ship gap is unhealthy the whole screen
// desaturates slightly so the dysfunction intrudes on the eye without a single number being faked.
//
// Live updating: <TopRail/> mounts <AutoRefresh/>, a client component that calls router.refresh()
// every ~45s to re-run this server page. No Date.now() is called during render here — the only
// clock shown is the snapshot's own `at` timestamp (deterministic) and the client live indicator.

export default async function CockpitPage() {
  const snap = await getCockpitSnapshot();
  const unhealthy = buildShipUnhealthy(snap.buildShip);
  const prodSha = snap.health.deployDrift?.prodSha ?? null;

  return (
    <CenterProvider>
      {/* full-bleed dark canvas; subtle desaturation + dimming when the build/ship gap is unhealthy
          (the anomaly intrudes on the whole screen — the cockpit's conscience). */}
      <div
        className={
          "relative flex h-[calc(100vh-3.5rem)] w-full flex-col gap-2 overflow-hidden bg-zinc-950 p-2 transition-[filter] duration-700 " +
          (unhealthy ? "[filter:saturate(0.72)_brightness(0.94)]" : "")
        }
      >
        {/* anomaly band: a thin top accent that bleeds in when something is wrong */}
        {unhealthy && (
          <div
            aria-hidden
            className="pointer-events-none absolute inset-x-0 top-14 h-px bg-gradient-to-r from-transparent via-rose-500/40 to-transparent"
          />
        )}

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

        {/* ── source-error footer (subtle, surfaced, never hidden) ──────────────────── */}
        <CockpitErrors errors={snap.errors} />
      </div>
    </CenterProvider>
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
