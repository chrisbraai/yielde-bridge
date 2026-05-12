import Link from "next/link";
import { listAuditEvents } from "@/lib/audit";
import { listCapabilities, type Capability } from "@/lib/config";
import { RegistryHeader } from "@/components/registry-header";
import { fmtTimestamp } from "@/lib/time";

export const dynamic = "force-dynamic";

type SearchParams = Promise<{
  capability?: string;
  limit?: string;
}>;

function parseLimit(raw: string | undefined): number {
  const n = raw ? parseInt(raw, 10) : NaN;
  if (Number.isNaN(n)) return 200;
  return Math.min(Math.max(n, 1), 2000);
}

export default async function CapabilityDecisionsPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const sp = await searchParams;
  const limit = parseLimit(sp.limit);
  const capabilityFilter = sp.capability?.trim() || undefined;

  const [allBlocked, capabilities] = await Promise.all([
    listAuditEvents({ event: "capability.blocked", limit: 2000 }),
    listCapabilities(),
  ]);

  const filtered = capabilityFilter
    ? allBlocked.filter((ev) => ev.capability === capabilityFilter)
    : allBlocked;
  const events = filtered.slice(0, limit);

  const grouped = new Map<string, number>();
  for (const ev of allBlocked) {
    if (typeof ev.capability !== "string") continue;
    grouped.set(ev.capability, (grouped.get(ev.capability) ?? 0) + 1);
  }
  const groupedRows = [...grouped.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count);

  const capByName = new Map<string, Capability>(capabilities.map((c) => [c.name, c]));

  return (
    <div>
      <RegistryHeader
        title="Capability decisions"
        count={events.length}
        source="audit.jsonl: capability.blocked"
        hint={`${allBlocked.length} lifetime blocks · ${capabilities.length} capabilities registered`}
      />

      <div className="grid grid-cols-[1fr_280px] gap-6">
        <div>
          <div className="mb-3 flex items-center gap-3 text-xs text-zinc-500">
            {capabilityFilter ? (
              <>
                <span>
                  Filter: <code className="text-zinc-300">{capabilityFilter}</code>
                </span>
                <Link
                  href="/inspect/capability-decisions"
                  className="text-blue-400 hover:text-blue-300"
                >
                  Clear
                </Link>
              </>
            ) : (
              <span>Newest first · click a capability on the right to filter</span>
            )}
          </div>

          {events.length === 0 ? (
            <div className="border border-zinc-800 rounded-lg p-10 text-center bg-zinc-950">
              <div className="text-sm text-zinc-400">No capability blocks match this filter.</div>
              <div className="text-xs text-zinc-600 mt-2">
                Block events fire from the kernel PreToolUse gate when a hard-gated capability is attempted.
              </div>
            </div>
          ) : (
            <div className="border border-zinc-800 rounded-lg overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-zinc-900 text-zinc-400 text-xs uppercase tracking-wide">
                  <tr>
                    <th className="px-4 py-2.5 text-left">When</th>
                    <th className="px-4 py-2.5 text-left">Capability</th>
                    <th className="px-4 py-2.5 text-left">Tool</th>
                    <th className="px-4 py-2.5 text-left">Command</th>
                    <th className="px-4 py-2.5 text-left">Session</th>
                  </tr>
                </thead>
                <tbody>
                  {events.map((ev, idx) => (
                    <tr
                      key={`${ev.ts}-${idx}`}
                      className="border-t border-zinc-800 hover:bg-zinc-900/50 align-top"
                    >
                      <td className="px-4 py-2 text-zinc-400 font-mono text-xs whitespace-nowrap">
                        {fmtTimestamp(ev.ts)}
                      </td>
                      <td className="px-4 py-2 font-mono text-xs whitespace-nowrap">
                        {ev.capability ? (
                          <Link
                            href={`/inspect/capability-decisions?capability=${encodeURIComponent(ev.capability)}`}
                            className="text-rose-300 hover:text-rose-200"
                          >
                            {ev.capability}
                          </Link>
                        ) : (
                          <span className="text-zinc-600">—</span>
                        )}
                      </td>
                      <td className="px-4 py-2 text-zinc-300 font-mono text-xs whitespace-nowrap">
                        {ev.tool ?? <span className="text-zinc-600">—</span>}
                      </td>
                      <td className="px-4 py-2 text-zinc-300 text-xs font-mono break-all">
                        {ev.command ?? <span className="text-zinc-600">—</span>}
                      </td>
                      <td className="px-4 py-2 text-zinc-500 font-mono text-xs whitespace-nowrap">
                        {ev.session_id ? ev.session_id.slice(0, 12) : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <aside className="border border-zinc-800 rounded-lg bg-zinc-950 p-4 self-start">
          <h2 className="text-xs uppercase tracking-wide text-zinc-500 mb-3">
            Hits by capability
          </h2>
          {groupedRows.length === 0 ? (
            <div className="text-xs text-zinc-600">No capability blocks recorded.</div>
          ) : (
            <ul className="space-y-2">
              {groupedRows.map((row) => {
                const meta = capByName.get(row.name);
                return (
                  <li key={row.name}>
                    <Link
                      href={`/inspect/capability-decisions?capability=${encodeURIComponent(row.name)}`}
                      className="block hover:bg-zinc-900 rounded px-2 py-1.5 -mx-2"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-mono text-xs text-zinc-200 truncate">{row.name}</span>
                        <span className="font-mono text-xs text-zinc-500 tabular-nums">{row.count}</span>
                      </div>
                      {meta?.refusal && (
                        <div className="text-[11px] text-zinc-500 mt-0.5 line-clamp-2">{meta.refusal}</div>
                      )}
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </aside>
      </div>
    </div>
  );
}
