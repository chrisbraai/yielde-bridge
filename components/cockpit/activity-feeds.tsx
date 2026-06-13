import { listBrainInboxDrafts } from "@/lib/brain-inbox";
import { listAuditEvents } from "@/lib/audit";
import { listRecentOperatorRuns, listRecentWebhookDeliveries } from "@/lib/runtime";
import { fmtTimestamp } from "@/lib/time";
import { SectionHeader } from "./consistency-board";
import { Kicker } from "./primitives";

// ── Activity feeds — "the more info", surfaced inline so Chris never opens a room ────────────────
//
// FOUR compact recent feeds from the existing readers (no new data sources):
//   lib/brain-inbox.ts  listBrainInboxDrafts()         → recent brain _inbox drafts awaiting promote
//   lib/audit.ts        listAuditEvents({limit})       → recent kernel audit events (newest-first)
//   lib/runtime.ts      listRecentOperatorRuns()       → recent operator runs
//   lib/runtime.ts      listRecentWebhookDeliveries()  → recent inbound webhook deliveries
//
// SERVER component. runtime.db reads + filesystem reads — the page is force-dynamic so this re-runs
// each refresh. Each column is independent and degrades to an honest empty line.

export async function ActivityFeeds() {
  const [drafts, audit, runs] = await Promise.all([
    listBrainInboxDrafts().catch(() => []),
    listAuditEvents({ limit: 8 }).catch(() => []),
    Promise.resolve().then(() => {
      try {
        return listRecentOperatorRuns(6);
      } catch {
        return [];
      }
    }),
  ]);
  // runtime.db reads are sync; guard them so a missing db can't sink the section.
  let deliveries: ReturnType<typeof listRecentWebhookDeliveries> = [];
  try {
    deliveries = listRecentWebhookDeliveries(6);
  } catch {
    deliveries = [];
  }

  return (
    <section className="flex flex-col gap-3">
      <SectionHeader
        kicker="Activity"
        title="Recent across the Bridge"
        note="brain drafts · kernel audit · operator runs · webhook deliveries"
      />

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2 xl:grid-cols-4">
        {/* Brain _inbox drafts */}
        <FeedCard label="Brain drafts" count={drafts.length} empty="no drafts in _inbox/">
          {drafts.slice(0, 5).map((d) => (
            <FeedRow
              key={d.filename}
              primary={d.title}
              secondary={d.kind}
              meta={fmtTimestamp(d.modifiedAt, { stripMillis: true }).slice(0, 16)}
              tone="default"
            />
          ))}
        </FeedCard>

        {/* Kernel audit */}
        <FeedCard label="Kernel audit" count={audit.length} empty="audit.jsonl empty">
          {audit.slice(0, 5).map((e, i) => (
            <FeedRow
              key={`${e.ts}-${i}`}
              primary={e.event}
              secondary={e.capability || e.tool || e.actor || e.intent || e.status || ""}
              meta={fmtTimestamp(e.ts, { stripMillis: true }).slice(0, 16)}
              tone={
                /denied|refus|fail|error|block/i.test(e.event) ? "danger" : "muted"
              }
            />
          ))}
        </FeedCard>

        {/* Operator runs */}
        <FeedCard label="Operator runs" count={runs.length} empty="no operator runs yet">
          {runs.slice(0, 5).map((r) => (
            <FeedRow
              key={`${r.agent}-${r.run_id}`}
              primary={r.agent}
              secondary={r.status || "—"}
              meta={fmtTimestamp(r.started_at, { stripMillis: true }).slice(0, 16)}
              tone={
                r.status === "failed"
                  ? "danger"
                  : r.status === "succeeded"
                    ? "good"
                    : "muted"
              }
            />
          ))}
        </FeedCard>

        {/* Webhook deliveries */}
        <FeedCard
          label="Webhook deliveries"
          count={deliveries.length}
          empty="no deliveries recorded"
        >
          {deliveries.slice(0, 5).map((w) => (
            <FeedRow
              key={w.id}
              primary={w.slug}
              secondary={`${w.status} · ${w.http_code}`}
              meta={fmtTimestamp(w.received_at, { stripMillis: true }).slice(0, 16)}
              tone={
                w.status === "accepted"
                  ? "good"
                  : w.status === "rejected" || w.status === "error"
                    ? "danger"
                    : "muted"
              }
            />
          ))}
        </FeedCard>
      </div>
    </section>
  );
}

function FeedCard({
  label,
  count,
  empty,
  children,
}: {
  label: string;
  count: number;
  empty: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2 rounded-xl border border-zinc-800/80 bg-gradient-to-b from-zinc-900/40 to-zinc-950 p-3.5">
      <div className="flex items-baseline justify-between border-b border-zinc-900 pb-1.5">
        <Kicker>{label}</Kicker>
        <span className="font-mono text-[10px] tabular-nums text-zinc-600">{count}</span>
      </div>
      {count === 0 ? (
        <div className="rounded-lg border border-dashed border-zinc-800/80 px-2.5 py-3 text-center font-mono text-[11px] text-zinc-600">
          {empty}
        </div>
      ) : (
        <ul className="flex flex-col gap-1">{children}</ul>
      )}
    </div>
  );
}

function FeedRow({
  primary,
  secondary,
  meta,
  tone = "muted",
}: {
  primary: string;
  secondary?: string;
  meta?: string;
  tone?: "default" | "good" | "danger" | "muted";
}) {
  const dot: Record<string, string> = {
    default: "bg-zinc-500",
    good: "bg-emerald-500",
    danger: "bg-rose-500",
    muted: "bg-zinc-700",
  };
  return (
    <li className="flex items-center gap-2 border-b border-zinc-900/70 pb-1 last:border-0">
      <span aria-hidden className={`h-1.5 w-1.5 shrink-0 rounded-full ${dot[tone]}`} />
      <div className="flex min-w-0 flex-1 flex-col">
        <span className="truncate font-mono text-[11.5px] text-zinc-300" title={primary}>
          {primary}
        </span>
        {secondary ? (
          <span className="truncate font-mono text-[9px] text-zinc-600" title={secondary}>
            {secondary}
          </span>
        ) : null}
      </div>
      {meta ? (
        <span className="shrink-0 font-mono text-[9px] tabular-nums text-zinc-700">{meta}</span>
      ) : null}
    </li>
  );
}
