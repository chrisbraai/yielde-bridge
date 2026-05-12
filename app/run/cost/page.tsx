import { listDailyCostBuckets, runtimeStats } from "@/lib/runtime";
import { syncOperatorRuns } from "@/lib/operator-runs";
import { RegistryHeader } from "@/components/registry-header";

export const dynamic = "force-dynamic";

const DAYS = 14;

function fmtUsd(cents: number): string {
  if (cents === 0) return "$0.00";
  return `$${(cents / 100).toFixed(2)}`;
}

export default async function CostPage() {
  await syncOperatorRuns().catch(() => undefined);

  const buckets = listDailyCostBuckets(DAYS);
  const stats = runtimeStats();

  const days = buckets.map((b) => ({
    day: b.day,
    session: b.session_cents,
    operator: b.operator_cents,
    total: b.session_cents + b.operator_cents,
  }));

  const totalSession = days.reduce((s, d) => s + d.session, 0);
  const totalOperator = days.reduce((s, d) => s + d.operator, 0);
  const grand = totalSession + totalOperator;
  const maxDay = Math.max(1, ...days.map((d) => d.total));

  return (
    <div>
      <RegistryHeader
        title="Cost"
        count={grand}
        source="runtime.db: sessions + operator_runs"
        hint={`last ${DAYS} days · displayed in cents · ${stats.operatorRuns} operator runs · ${stats.sessions} sessions tracked`}
      />

      <div className="grid grid-cols-3 gap-4 mb-6">
        <CostCard label="Sessions" cents={totalSession} accent="border-blue-700/50 text-blue-300" />
        <CostCard label="Operator" cents={totalOperator} accent="border-amber-700/50 text-amber-300" />
        <CostCard label="Total" cents={grand} accent="border-emerald-700/50 text-emerald-300" />
      </div>

      <div className="border border-zinc-800 rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-zinc-900 text-zinc-400 text-xs uppercase tracking-wide">
            <tr>
              <th className="px-4 py-2.5 text-left">Day</th>
              <th className="px-4 py-2.5 text-right">Sessions</th>
              <th className="px-4 py-2.5 text-right">Operator</th>
              <th className="px-4 py-2.5 text-right">Total</th>
              <th className="px-4 py-2.5 text-left">Distribution</th>
            </tr>
          </thead>
          <tbody>
            {days.map((d) => {
              const sessionPct = (d.session / maxDay) * 100;
              const operatorPct = (d.operator / maxDay) * 100;
              return (
                <tr key={d.day} className="border-t border-zinc-800 hover:bg-zinc-900/50">
                  <td className="px-4 py-2.5 text-zinc-400 font-mono text-xs">{d.day}</td>
                  <td className="px-4 py-2.5 text-right text-zinc-300 font-mono tabular-nums text-xs">
                    {fmtUsd(d.session)}
                  </td>
                  <td className="px-4 py-2.5 text-right text-zinc-300 font-mono tabular-nums text-xs">
                    {fmtUsd(d.operator)}
                  </td>
                  <td className="px-4 py-2.5 text-right text-zinc-100 font-mono tabular-nums text-xs">
                    {fmtUsd(d.total)}
                  </td>
                  <td className="px-4 py-2.5">
                    <div className="flex h-2 bg-zinc-900 rounded overflow-hidden max-w-xs">
                      <div
                        className="bg-blue-600/70"
                        style={{ width: `${sessionPct}%` }}
                        title={`sessions ${fmtUsd(d.session)}`}
                      />
                      <div
                        className="bg-amber-600/70"
                        style={{ width: `${operatorPct}%` }}
                        title={`operator ${fmtUsd(d.operator)}`}
                      />
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-zinc-600 mt-4">
        Cost rows are populated as sessions and operator runs report{" "}
        <code className="text-zinc-500">cost_cents</code>. Empty days reflect runs without a
        reported cost, not zero spend.
      </p>
    </div>
  );
}

function CostCard({
  label,
  cents,
  accent,
}: {
  label: string;
  cents: number;
  accent: string;
}) {
  return (
    <div className={"border rounded-lg bg-zinc-950 px-4 py-3 " + accent}>
      <div className="text-xs uppercase tracking-wide text-zinc-500">{label}</div>
      <div className="text-2xl font-mono tabular-nums mt-1">{fmtUsd(cents)}</div>
    </div>
  );
}
