import { listMcpServers } from "@/lib/config";
import { RegistryEmpty } from "@/components/registry-empty";
import { RegistryHeader } from "@/components/registry-header";

export const dynamic = "force-dynamic";

export default async function McpPage() {
  const servers = await listMcpServers();

  return (
    <div>
      <RegistryHeader
        title="MCP Servers"
        count={servers.length}
        source="yielde-bridge-config/mcp.json"
        hint="bridge sync derives ~/.claude/settings.json + ~/.cursor/mcp.json"
      />

      {servers.length === 0 ? (
        <RegistryEmpty
          what="MCP servers"
          cli="bridge add mcp <name> --transport stdio --command <cmd>"
        />
      ) : (
        <div className="border border-zinc-800 rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-zinc-900 text-zinc-400 text-xs uppercase tracking-wide">
              <tr>
                <th className="px-4 py-2.5 text-left">Name</th>
                <th className="px-4 py-2.5 text-left">Transport</th>
                <th className="px-4 py-2.5 text-left">Target</th>
                <th className="px-4 py-2.5 text-left">Secret refs</th>
                <th className="px-4 py-2.5 text-left">Enabled for</th>
              </tr>
            </thead>
            <tbody>
              {servers.map((s) => (
                <tr key={s.name} className="border-t border-zinc-800 hover:bg-zinc-900/50">
                  <td className="px-4 py-2.5 text-zinc-100 font-mono">{s.name}</td>
                  <td className="px-4 py-2.5">
                    <TransportBadge transport={s.transport} />
                  </td>
                  <td className="px-4 py-2.5 text-zinc-400 font-mono text-xs max-w-md truncate">
                    {s.url || [s.command, ...(s.args ?? [])].filter(Boolean).join(" ") || "—"}
                  </td>
                  <td className="px-4 py-2.5 text-zinc-400 font-mono text-xs">
                    {s.envRefs?.length ? s.envRefs.join(", ") : <span className="text-zinc-600">—</span>}
                  </td>
                  <td className="px-4 py-2.5 text-zinc-400 text-xs">
                    {s.enabledFor?.length ? s.enabledFor.join(" · ") : <span className="text-zinc-600">—</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function TransportBadge({ transport }: { transport: string }) {
  const styles: Record<string, string> = {
    stdio: "border-emerald-700/50 bg-emerald-900/20 text-emerald-400",
    sse: "border-blue-700/50 bg-blue-900/20 text-blue-400",
    http: "border-purple-700/50 bg-purple-900/20 text-purple-400",
  };
  const cls = styles[transport] || "border-zinc-700 bg-zinc-900 text-zinc-400";
  return (
    <span className={`inline-block px-2 py-0.5 text-xs rounded border font-mono ${cls}`}>
      {transport}
    </span>
  );
}
