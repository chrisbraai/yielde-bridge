import { recentOperatorRuns } from "@/lib/operator-runs";
import { Badge, type BadgeVariant } from "@/components/badge";
import { RegistryHeader } from "@/components/registry-header";
import { fmtTimestamp } from "@/lib/time";

export const dynamic = "force-dynamic";

function fmtCost(cents: number | null): string {
  if (cents === null || cents === 0) return "—";
  return `$${(cents / 100).toFixed(2)}`;
}

function fmtDuration(startIso: string, endIso: string | null): string {
  if (!endIso) return "—";
  const a = Date.parse(startIso);
  const b = Date.parse(endIso);
  if (Number.isNaN(a) || Number.isNaN(b)) return "—";
  const s = Math.max(0, Math.floor((b - a) / 1000));
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ${s % 60}s`;
  const h = Math.floor(m / 60);
  return `${h}h ${m % 60}m`;
}

export default async function OperatorRunsPage() {
  const runs = await recentOperatorRuns(50);

  return (
    <div>
      <RegistryHeader
        title="Operator runs"
        count={runs.length}
        source="~/.claude/operator/runs/*.jsonl → runtime.db"
        hint="last 50 across all agents · synced on every render"
      />

      {runs.length === 0 ? (
        <div className="border border-zinc-800 rounded-lg p-10 text-center bg-zinc-950">
          <div className="text-sm text-zinc-400">No operator runs found.</div>
          <div className="text-xs text-zinc-600 mt-2">
            Trigger one with{" "}
            <code className="text-zinc-500">/operator deploy &lt;agent-name&gt;</code>.
          </div>
        </div>
      ) : (
        <div className="border border-zinc-800 rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-zinc-900 text-zinc-400 text-xs uppercase tracking-wide">
              <tr>
                <th className="px-4 py-2.5 text-left">Agent</th>
                <th className="px-4 py-2.5 text-left">Run</th>
                <th className="px-4 py-2.5 text-left">Started</th>
                <th className="px-4 py-2.5 text-left">Status</th>
                <th className="px-4 py-2.5 text-right">Duration</th>
                <th className="px-4 py-2.5 text-right">Tokens</th>
                <th className="px-4 py-2.5 text-right">Cost</th>
                <th className="px-4 py-2.5 text-left">Summary</th>
              </tr>
            </thead>
            <tbody>
              {runs.map((r) => {
                const tokens =
                  r.tokens_in === null && r.tokens_out === null
                    ? "—"
                    : `${(r.tokens_in ?? 0) + (r.tokens_out ?? 0)}`;
                const statusVariant: BadgeVariant =
                  r.status === "success"
                    ? "success"
                    : r.status === "running"
                      ? "info"
                      : r.status === null
                        ? "muted"
                        : "danger";
                return (
                  <tr key={r.id} className="border-t border-zinc-800 hover:bg-zinc-900/50">
                    <td className="px-4 py-2.5 text-zinc-100 font-mono">{r.agent}</td>
                    <td className="px-4 py-2.5 text-zinc-500 font-mono text-xs">{r.run_id}</td>
                    <td className="px-4 py-2.5 text-zinc-400 font-mono text-xs">
                      {fmtTimestamp(r.started_at)}
                    </td>
                    <td className="px-4 py-2.5">
                      <Badge variant={statusVariant}>{r.status ?? "unknown"}</Badge>
                    </td>
                    <td className="px-4 py-2.5 text-right text-zinc-400 font-mono tabular-nums text-xs">
                      {fmtDuration(r.started_at, r.finished_at)}
                    </td>
                    <td className="px-4 py-2.5 text-right text-zinc-400 font-mono tabular-nums text-xs">
                      {tokens}
                    </td>
                    <td className="px-4 py-2.5 text-right text-zinc-300 font-mono tabular-nums text-xs">
                      {fmtCost(r.cost_cents)}
                    </td>
                    <td className="px-4 py-2.5 text-zinc-400 text-xs max-w-md truncate" title={r.summary ?? ""}>
                      {r.summary ?? <span className="text-zinc-600">—</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
