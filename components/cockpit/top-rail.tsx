import type { Health, ServiceHealth } from "@/lib/cockpit/types";
import { Dot } from "./primitives";
import { AutoRefresh } from "./auto-refresh";

// TOP RAIL — full-width status spine. Date/time, per-service health dots, deploy SHA when known,
// and a single calm "all systems" vs intruding-red verdict. Errors count surfaces here too.
//
// `assembledAt` is the snapshot's ISO timestamp (server-derived, stable across the render); we show
// the wall-clock separately via the live <AutoRefresh/> indicator so we never call Date in render.

function fmtClock(iso: string): { date: string; time: string } {
  // Snapshot.at is ISO; render it directly (server value, deterministic). Display "YYYY-MM-DD" +
  // "HH:MM" without seconds for a calm read.
  const [datePart, rest] = iso.replace("Z", "").split("T");
  const time = (rest ?? "").slice(0, 5);
  return { date: datePart ?? iso, time };
}

export function TopRail({
  assembledAt,
  health,
  errorCount,
  prodSha,
}: {
  assembledAt: string;
  health: Health;
  errorCount: number;
  prodSha: string | null;
}) {
  const services: ServiceHealth[] = health.services ?? [];
  const allUp = services.length > 0 && services.every((s) => s.up);
  const anyDown = services.some((s) => !s.up);
  const { date, time } = fmtClock(assembledAt);

  const verdict = anyDown
    ? { text: "DEGRADED", cls: "border-rose-700/50 bg-rose-900/20 text-rose-400" }
    : allUp
      ? { text: "ALL SYSTEMS", cls: "border-emerald-700/40 bg-emerald-900/15 text-emerald-400" }
      : { text: "NO PROBES", cls: "border-zinc-700 bg-zinc-900 text-zinc-500" };

  return (
    <div className="flex h-full w-full items-center gap-5 px-4">
      {/* Identity + clock */}
      <div className="flex shrink-0 items-baseline gap-2.5">
        <span className="font-mono text-sm font-semibold tracking-tight text-zinc-100">
          <span className="text-blue-500">◆</span> YIELDE COMMAND
        </span>
        <span className="font-mono text-sm tabular-nums text-zinc-300">{time}</span>
        <span className="font-mono text-[11px] tabular-nums text-zinc-600">{date}</span>
      </div>

      {/* Verdict pill */}
      <span
        className={`shrink-0 rounded border px-2 py-0.5 font-mono text-[10px] tracking-[0.18em] ${verdict.cls}`}
      >
        {verdict.text}
      </span>

      {/* Service dots */}
      <div className="flex min-w-0 flex-1 items-center gap-3 overflow-hidden">
        {services.length === 0 ? (
          <span className="font-mono text-[10px] text-zinc-600">no services probed</span>
        ) : (
          services.map((s) => (
            <span key={s.name} className="flex shrink-0 items-center gap-1.5">
              <Dot
                up={s.up}
                title={`${s.name} · ${s.up ? "up" : "down"}${s.status ? ` · ${s.status}` : ""}${s.ms != null ? ` · ${s.ms}ms` : ""}`}
              />
              <span className="font-mono text-[11px] text-zinc-400">{s.name}</span>
              {s.ms != null && (
                <span className="font-mono text-[10px] tabular-nums text-zinc-600">
                  {s.ms}ms
                </span>
              )}
            </span>
          ))
        )}
      </div>

      {/* Deploy SHA + drift */}
      {prodSha && (
        <span
          className="shrink-0 font-mono text-[11px] text-zinc-500"
          title="prod deploy SHA"
        >
          prod <span className="text-zinc-300">{prodSha.slice(0, 7)}</span>
        </span>
      )}
      {health.deployDrift?.behind && (
        <span className="shrink-0 rounded border border-rose-700/50 bg-rose-900/20 px-1.5 py-0.5 font-mono text-[10px] text-rose-400">
          drift
        </span>
      )}

      {/* Errors + live indicator */}
      {errorCount > 0 && (
        <span
          className="shrink-0 rounded border border-amber-700/50 bg-amber-900/20 px-1.5 py-0.5 font-mono text-[10px] text-amber-400"
          title="non-fatal source errors — see footer"
        >
          {errorCount} src err
        </span>
      )}
      <span className="shrink-0">
        <AutoRefresh intervalMs={45_000} />
      </span>
    </div>
  );
}
