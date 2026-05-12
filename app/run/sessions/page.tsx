import { listSessions } from "@/lib/sessions";
import { RegistryHeader } from "@/components/registry-header";

export const dynamic = "force-dynamic";

function relative(ts: string | null): string {
  if (!ts) return "—";
  const t = Date.parse(ts);
  if (Number.isNaN(t)) return ts;
  const delta = Math.max(0, Date.now() - t);
  const s = Math.floor(delta / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

export default async function SessionsPage() {
  const sessions = await listSessions();
  const active = sessions.filter((s) => s.status !== "stopped");

  return (
    <div>
      <RegistryHeader
        title="Sessions"
        count={active.length}
        source="~/.claude/os/sessions.json"
        hint="active first · stopped sessions in history below"
      />

      {sessions.length === 0 ? (
        <div className="border border-zinc-800 rounded-lg p-10 text-center bg-zinc-950">
          <div className="text-sm text-zinc-400">No sessions recorded yet.</div>
          <div className="text-xs text-zinc-600 mt-2">
            The Yielde OS kernel writes session rows to{" "}
            <code className="text-zinc-500">~/.claude/os/sessions.json</code> on every SessionStart hook.
          </div>
        </div>
      ) : (
        <div className="border border-zinc-800 rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-zinc-900 text-zinc-400 text-xs uppercase tracking-wide">
              <tr>
                <th className="px-4 py-2.5 text-left">Role</th>
                <th className="px-4 py-2.5 text-left">Status</th>
                <th className="px-4 py-2.5 text-left">Intent</th>
                <th className="px-4 py-2.5 text-left">Started</th>
                <th className="px-4 py-2.5 text-left">Heartbeat</th>
                <th className="px-4 py-2.5 text-left">Session</th>
              </tr>
            </thead>
            <tbody>
              {sessions.map((s) => {
                const isActive = s.status !== "stopped";
                return (
                  <tr key={s.id} className="border-t border-zinc-800 hover:bg-zinc-900/50">
                    <td className="px-4 py-2.5">
                      <span
                        className={
                          "inline-block px-2 py-0.5 text-xs rounded border font-mono " +
                          (s.role === "kernel"
                            ? "border-amber-700/50 bg-amber-900/20 text-amber-400"
                            : "border-zinc-700 bg-zinc-900 text-zinc-300")
                        }
                      >
                        {s.role || "worker"}
                      </span>
                    </td>
                    <td className="px-4 py-2.5">
                      <span
                        className={
                          "inline-block px-2 py-0.5 text-xs rounded border font-mono " +
                          (isActive
                            ? "border-emerald-700/50 bg-emerald-900/20 text-emerald-400"
                            : "border-zinc-700/50 bg-zinc-900/40 text-zinc-500")
                        }
                      >
                        {s.status || "unknown"}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-zinc-300 max-w-md truncate" title={s.intent}>
                      {s.intent || <span className="text-zinc-600">—</span>}
                    </td>
                    <td className="px-4 py-2.5 text-zinc-400 font-mono text-xs">
                      {relative(s.startedAt)}
                    </td>
                    <td className="px-4 py-2.5 text-zinc-400 font-mono text-xs">
                      {relative(s.lastHeartbeat)}
                    </td>
                    <td className="px-4 py-2.5 text-zinc-500 font-mono text-xs">
                      {s.id.slice(0, 8)}
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
