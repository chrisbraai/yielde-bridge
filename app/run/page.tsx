import Link from "next/link";
import { listSessions } from "@/lib/sessions";
import { syncOperatorRuns } from "@/lib/operator-runs";
import {
  listRecentOperatorRuns,
  listRecentWebhookDeliveries,
  runtimeStats,
} from "@/lib/runtime";
import { listWebhooks } from "@/lib/config";
import { fmtTimestamp } from "@/lib/time";

export const dynamic = "force-dynamic";

export default async function RunOverviewPage() {
  await syncOperatorRuns().catch(() => undefined);

  const [sessions, { inbound }] = await Promise.all([listSessions(), listWebhooks()]);
  const operatorRuns = listRecentOperatorRuns(5);
  const deliveries = listRecentWebhookDeliveries(5);
  const stats = runtimeStats();
  const activeSessions = sessions.filter((s) => s.status !== "stopped").length;

  return (
    <div>
      <header className="mb-6">
        <h1 className="text-xl font-semibold text-zinc-100">Run</h1>
        <p className="text-sm text-zinc-500 mt-1">
          Live state from Yielde OS + Bridge runtime DB. Counts are real, not placeholders.
        </p>
      </header>

      <div className="grid grid-cols-4 gap-4 mb-8">
        <StatCard
          href="/run/sessions"
          label="Active sessions"
          value={activeSessions}
          sub={`${sessions.length} total`}
        />
        <StatCard
          href="/run/operator"
          label="Operator runs"
          value={stats.operatorRuns}
          sub="last 50 in detail"
        />
        <StatCard
          href="/run/webhook-tail"
          label="Webhook deliveries"
          value={stats.webhooks}
          sub={`${inbound.length} inbound slug${inbound.length === 1 ? "" : "s"}`}
        />
        <StatCard href="/run/cost" label="Cost (14d)" value="—" sub="see breakdown" />
      </div>

      <div className="grid grid-cols-2 gap-6">
        <Card title="Recent operator runs" linkHref="/run/operator" linkLabel="See all">
          {operatorRuns.length === 0 ? (
            <EmptyHint
              what="No operator runs recorded yet."
              cmd="/operator deploy <agent-name>"
            />
          ) : (
            <ul className="divide-y divide-zinc-800">
              {operatorRuns.map((r) => (
                <li key={r.id} className="py-2 flex items-center justify-between text-sm">
                  <div>
                    <div className="font-mono text-zinc-100">{r.agent}</div>
                    <div className="font-mono text-xs text-zinc-500">{r.run_id}</div>
                  </div>
                  <div className="text-xs text-zinc-500 font-mono">{r.status ?? "running"}</div>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card title="Recent webhook deliveries" linkHref="/run/webhook-tail" linkLabel="See all">
          {deliveries.length === 0 ? (
            <EmptyHint
              what="No webhook deliveries yet."
              cmd="POST signed payload to /api/webhooks/<slug>"
            />
          ) : (
            <ul className="divide-y divide-zinc-800">
              {deliveries.map((d) => (
                <li key={d.id} className="py-2 flex items-center justify-between text-sm">
                  <div>
                    <div className="font-mono text-zinc-100">{d.slug}</div>
                    <div className="font-mono text-xs text-zinc-500">
                      {fmtTimestamp(d.received_at)}
                    </div>
                  </div>
                  <div className="font-mono text-xs text-zinc-400">
                    {d.status} · {d.http_code}
                  </div>
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
