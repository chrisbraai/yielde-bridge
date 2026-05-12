import Link from "next/link";
import { auditTotalLines, auditEventCounts, listAuditEvents } from "@/lib/audit";
import { listBrainInboxDrafts } from "@/lib/brain-inbox";
import { readUsage } from "@/lib/usage";
import { buildSkillGraph } from "@/lib/skill-graph";

export const dynamic = "force-dynamic";

export default async function InspectOverviewPage() {
  const [total, eventCounts, drafts, blocked, usage, graph] = await Promise.all([
    auditTotalLines(),
    auditEventCounts(),
    listBrainInboxDrafts(),
    listAuditEvents({ event: "capability.blocked", limit: 1000 }),
    readUsage(),
    buildSkillGraph(),
  ]);

  const skillCount = Object.keys(usage.skills).length;
  const totalUses = Object.values(usage.skills).reduce((sum, s) => sum + (s.uses ?? 0), 0);
  const topEvents = eventCounts.slice(0, 6);
  const recentDrafts = drafts.slice(0, 5);

  return (
    <div>
      <header className="mb-6">
        <h1 className="text-xl font-semibold text-zinc-100">Inspect</h1>
        <p className="text-sm text-zinc-500 mt-1">
          Read-only window into kernel audit, brain drafts, capability gates, and skill telemetry.
          Promote actions stay Chris-only via{" "}
          <code className="text-zinc-400 text-xs">/brain-log promote</code>.
        </p>
      </header>

      <div className="grid grid-cols-5 gap-4 mb-8">
        <StatCard
          href="/inspect/audit-search"
          label="Audit entries"
          value={total}
          sub="~/.claude/os/audit.jsonl"
        />
        <StatCard
          href="/inspect/brain-inbox"
          label="Brain drafts"
          value={drafts.length}
          sub="awaiting promote"
        />
        <StatCard
          href="/inspect/capability-decisions"
          label="Capability blocks"
          value={blocked.length}
          sub="lifetime kernel gate hits"
        />
        <StatCard
          href="/inspect/skill-traces"
          label="Skills with use"
          value={skillCount}
          sub={`${totalUses} total uses`}
        />
        <StatCard
          href="/inspect/skill-graph"
          label="Skill graph edges"
          value={graph.stats.totalEdges}
          sub={`${graph.stats.totalNodes} nodes · ${graph.stats.orphanRefCount} orphan refs`}
        />
      </div>

      <div className="grid grid-cols-2 gap-6">
        <Card title="Top audit events" linkHref="/inspect/audit-search" linkLabel="Search audit">
          {topEvents.length === 0 ? (
            <EmptyHint what="No audit events recorded yet." cmd="Yielde OS kernel writes on session events" />
          ) : (
            <ul className="divide-y divide-zinc-800">
              {topEvents.map((row) => (
                <li key={row.event} className="py-2 flex items-center justify-between text-sm">
                  <Link
                    href={`/inspect/audit-search?event=${encodeURIComponent(row.event)}`}
                    className="font-mono text-zinc-100 hover:text-blue-400"
                  >
                    {row.event}
                  </Link>
                  <span className="font-mono text-xs text-zinc-500 tabular-nums">{row.count}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card title="Recent brain drafts" linkHref="/inspect/brain-inbox" linkLabel="Review all">
          {recentDrafts.length === 0 ? (
            <EmptyHint
              what="No drafts in _inbox/ yet."
              cmd="Stop hook + /brain-log write drafts here"
            />
          ) : (
            <ul className="divide-y divide-zinc-800">
              {recentDrafts.map((d) => (
                <li key={d.filename} className="py-2 text-sm">
                  <div className="flex items-center justify-between gap-3">
                    <Link
                      href={`/inspect/brain-inbox?file=${encodeURIComponent(d.filename)}`}
                      className="font-mono text-zinc-100 hover:text-blue-400 truncate"
                      title={d.filename}
                    >
                      {d.title}
                    </Link>
                    <span className="font-mono text-xs text-zinc-500 whitespace-nowrap">
                      {d.kind}
                    </span>
                  </div>
                  <div className="text-xs text-zinc-600 font-mono mt-0.5">{d.filename}</div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}

function StatCard({
  href,
  label,
  value,
  sub,
}: {
  href: string;
  label: string;
  value: number | string;
  sub: string;
}) {
  return (
    <Link
      href={href}
      className="block border border-zinc-800 rounded-lg bg-zinc-950 px-4 py-3 hover:border-zinc-700 transition-colors"
    >
      <div className="text-xs uppercase tracking-wide text-zinc-500">{label}</div>
      <div className="text-2xl font-mono tabular-nums text-zinc-100 mt-1">{value}</div>
      <div className="text-xs text-zinc-600 mt-1">{sub}</div>
    </Link>
  );
}

function Card({
  title,
  linkHref,
  linkLabel,
  children,
}: {
  title: string;
  linkHref: string;
  linkLabel: string;
  children: React.ReactNode;
}) {
  return (
    <section className="border border-zinc-800 rounded-lg bg-zinc-950 p-4">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm uppercase tracking-wide text-zinc-400">{title}</h2>
        <Link href={linkHref} className="text-xs text-blue-400 hover:text-blue-300">
          {linkLabel} →
        </Link>
      </div>
      {children}
    </section>
  );
}

function EmptyHint({ what, cmd }: { what: string; cmd: string }) {
  return (
    <div className="text-center py-6">
      <div className="text-sm text-zinc-400">{what}</div>
      <code className="inline-block mt-2 px-2 py-1 text-xs bg-zinc-900 rounded text-zinc-500 font-mono">
        {cmd}
      </code>
    </div>
  );
}
