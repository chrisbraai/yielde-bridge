import { listAuditEvents, auditEventCounts, auditTotalLines } from "@/lib/audit";
import { RegistryHeader } from "@/components/registry-header";
import Link from "next/link";

export const dynamic = "force-dynamic";

type SearchParams = Promise<{
  q?: string;
  event?: string;
  session?: string;
  limit?: string;
}>;

function parseLimit(raw: string | undefined): number {
  const n = raw ? parseInt(raw, 10) : NaN;
  if (Number.isNaN(n)) return 200;
  return Math.min(Math.max(n, 1), 2000);
}

function fmtTs(ts: string): string {
  return ts.replace("T", " ").replace("Z", "");
}

function recordSummary(ev: Record<string, unknown>): string {
  const skip = new Set(["ts", "event", "session_id"]);
  const parts: string[] = [];
  for (const [k, v] of Object.entries(ev)) {
    if (skip.has(k)) continue;
    if (v == null) continue;
    if (typeof v === "string") parts.push(`${k}=${v}`);
    else if (typeof v === "number" || typeof v === "boolean") parts.push(`${k}=${v}`);
    else parts.push(`${k}=${JSON.stringify(v)}`);
  }
  return parts.join(" · ");
}

export default async function AuditSearchPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const sp = await searchParams;
  const limit = parseLimit(sp.limit);
  const q = sp.q?.trim() || undefined;
  const event = sp.event?.trim() || undefined;
  const sessionId = sp.session?.trim() || undefined;

  const [events, counts, total] = await Promise.all([
    listAuditEvents({ q, event, sessionId, limit }),
    auditEventCounts(),
    auditTotalLines(),
  ]);

  return (
    <div>
      <RegistryHeader
        title="Audit search"
        count={events.length}
        source="~/.claude/os/audit.jsonl"
        hint={`${total.toLocaleString()} total lines · newest first · max ${limit}`}
      />

      <form className="mb-6 flex flex-wrap items-end gap-3" action="/inspect/audit-search" method="get">
        <Field name="q" label="Substring (q)" defaultValue={q ?? ""} placeholder="braambos, deploy, error…" width="w-72" />
        <Field name="event" label="Event" defaultValue={event ?? ""} placeholder="session.started" width="w-56" />
        <Field name="session" label="Session id" defaultValue={sessionId ?? ""} placeholder="d66190bf…" width="w-56" />
        <Field name="limit" label="Limit" defaultValue={String(limit)} placeholder="200" width="w-24" />
        <button
          type="submit"
          className="px-3 py-1.5 text-sm rounded-md border border-blue-700/50 bg-blue-900/30 text-blue-200 hover:bg-blue-900/50"
        >
          Search
        </button>
        {(q || event || sessionId) && (
          <Link
            href="/inspect/audit-search"
            className="px-3 py-1.5 text-sm rounded-md border border-zinc-700 bg-zinc-900 text-zinc-300 hover:bg-zinc-800"
          >
            Clear
          </Link>
        )}
      </form>

      <div className="grid grid-cols-[1fr_240px] gap-6">
        <div>
          {events.length === 0 ? (
            <div className="border border-zinc-800 rounded-lg p-10 text-center bg-zinc-950">
              <div className="text-sm text-zinc-400">No audit events match this query.</div>
              <div className="text-xs text-zinc-600 mt-2">
                Try removing filters or widening the substring search.
              </div>
            </div>
          ) : (
            <div className="border border-zinc-800 rounded-lg overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-zinc-900 text-zinc-400 text-xs uppercase tracking-wide">
                  <tr>
                    <th className="px-4 py-2.5 text-left">When</th>
                    <th className="px-4 py-2.5 text-left">Event</th>
                    <th className="px-4 py-2.5 text-left">Session</th>
                    <th className="px-4 py-2.5 text-left">Detail</th>
                  </tr>
                </thead>
                <tbody>
                  {events.map((ev, idx) => (
                    <tr key={`${ev.ts}-${idx}`} className="border-t border-zinc-800 hover:bg-zinc-900/50 align-top">
                      <td className="px-4 py-2 text-zinc-400 font-mono text-xs whitespace-nowrap">
                        {fmtTs(ev.ts)}
                      </td>
                      <td className="px-4 py-2 text-zinc-100 font-mono text-xs whitespace-nowrap">
                        <Link
                          href={`/inspect/audit-search?event=${encodeURIComponent(ev.event)}`}
                          className="hover:text-blue-400"
                        >
                          {ev.event}
                        </Link>
                      </td>
                      <td className="px-4 py-2 text-zinc-500 font-mono text-xs whitespace-nowrap">
                        {ev.session_id ? (
                          <Link
                            href={`/inspect/audit-search?session=${encodeURIComponent(ev.session_id)}`}
                            className="hover:text-blue-400"
                          >
                            {ev.session_id.slice(0, 12)}
                          </Link>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td className="px-4 py-2 text-zinc-300 text-xs break-words">
                        {recordSummary(ev as Record<string, unknown>) || (
                          <span className="text-zinc-600">—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <aside className="border border-zinc-800 rounded-lg bg-zinc-950 p-4 self-start">
          <h2 className="text-xs uppercase tracking-wide text-zinc-500 mb-3">Event types</h2>
          {counts.length === 0 ? (
            <div className="text-xs text-zinc-600">No events.</div>
          ) : (
            <ul className="space-y-1.5">
              {counts.slice(0, 20).map((row) => (
                <li key={row.event} className="flex items-center justify-between text-xs">
                  <Link
                    href={`/inspect/audit-search?event=${encodeURIComponent(row.event)}`}
                    className="font-mono text-zinc-300 hover:text-blue-400 truncate"
                    title={row.event}
                  >
                    {row.event}
                  </Link>
                  <span className="font-mono text-zinc-500 tabular-nums ml-2">{row.count}</span>
                </li>
              ))}
            </ul>
          )}
        </aside>
      </div>
    </div>
  );
}

function Field({
  name,
  label,
  defaultValue,
  placeholder,
  width,
}: {
  name: string;
  label: string;
  defaultValue: string;
  placeholder: string;
  width: string;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-xs uppercase tracking-wide text-zinc-500">{label}</span>
      <input
        type="text"
        name={name}
        defaultValue={defaultValue}
        placeholder={placeholder}
        className={
          "px-2 py-1.5 text-sm bg-zinc-900 border border-zinc-800 rounded-md text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:border-zinc-600 " +
          width
        }
      />
    </label>
  );
}
