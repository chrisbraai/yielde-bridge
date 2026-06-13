import type { Health } from "@/lib/cockpit/types";
import { Zone, Dot } from "./primitives";

// RIGHT-FAR (bottom) — System health. Per-service up/down with latency, plus deploy-drift state.
// deployDrift is null until configured — we say "not configured" honestly rather than implying
// healthy. Minimal red/green.

export function HealthPanel({ health }: { health: Health }) {
  const services = health.services ?? [];
  const drift = health.deployDrift;

  return (
    <Zone title="System" titleTone="muted" className="min-h-0 flex-1">
      <div className="flex h-full flex-col gap-2">
        {services.length === 0 ? (
          <div className="flex flex-1 items-center justify-center rounded-lg border border-dashed border-zinc-800/80 text-center font-mono text-[11px] text-zinc-600">
            no services probed
          </div>
        ) : (
          <ul className="flex flex-col gap-1">
            {services.map((s) => (
              <li
                key={s.name}
                className="flex items-center gap-2 border-b border-zinc-900 pb-1 last:border-0"
              >
                <Dot up={s.up} title={s.url} />
                <span className="min-w-0 flex-1 truncate font-mono text-[11px] text-zinc-300">
                  {s.name}
                </span>
                <span
                  className={
                    "shrink-0 font-mono text-[10px] tabular-nums " +
                    (s.up ? "text-zinc-500" : "text-rose-400")
                  }
                >
                  {s.up ? (s.ms != null ? `${s.ms}ms` : "up") : "down"}
                </span>
                {s.status != null && (
                  <span className="shrink-0 font-mono text-[9px] tabular-nums text-zinc-600">
                    {s.status}
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}

        {/* deploy drift */}
        <div className="mt-auto border-t border-zinc-900 pt-2">
          {drift == null ? (
            <div className="font-mono text-[10px] text-zinc-600">
              deploy drift · not configured
            </div>
          ) : drift.behind ? (
            <div className="flex items-center gap-1.5 font-mono text-[10px] text-rose-400">
              <span className="inline-block h-1.5 w-1.5 rounded-full bg-rose-500" />
              prod behind main
              {drift.prodSha && drift.mainSha && (
                <span className="text-zinc-600">
                  {drift.prodSha.slice(0, 7)} ≠ {drift.mainSha.slice(0, 7)}
                </span>
              )}
            </div>
          ) : (
            <div className="flex items-center gap-1.5 font-mono text-[10px] text-emerald-400">
              <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-500" />
              prod in sync with main
            </div>
          )}
        </div>
      </div>
    </Zone>
  );
}
