"use client";

import { useEffect, useRef, useState } from "react";

export type StreamedDelivery = {
  id: number;
  slug: string;
  received_at: string;
  source_ip: string | null;
  payload_hash: string;
  status: "accepted" | "rejected" | "error";
  http_code: number;
  reason: string | null;
  dispatch_status: "queued" | "succeeded" | "failed" | "skipped" | null;
  dispatch_target: string | null;
  dispatch_run_id: string | null;
  dispatched_at: string | null;
  dispatch_log: string | null;
  redaction_applied: number;
};

type Props = {
  seed: StreamedDelivery[];
  seedCount: number;
};

type ConnState = "connecting" | "live" | "reconnecting" | "closed";

const STATUS_COLOR: Record<string, string> = {
  accepted: "border-emerald-700/50 bg-emerald-900/20 text-emerald-400",
  rejected: "border-amber-700/50 bg-amber-900/20 text-amber-400",
  error: "border-rose-700/50 bg-rose-900/20 text-rose-400",
};

const DISPATCH_COLOR: Record<string, string> = {
  succeeded: "border-emerald-700/50 bg-emerald-900/20 text-emerald-400",
  queued: "border-blue-700/50 bg-blue-900/20 text-blue-300",
  failed: "border-rose-700/50 bg-rose-900/20 text-rose-400",
  skipped: "border-zinc-700 bg-zinc-900 text-zinc-400",
};

function isFresh(rowTs: string, now: number): boolean {
  return now - Date.parse(rowTs) < 1500;
}

export function WebhookTailLive({ seed, seedCount }: Props) {
  const [rows, setRows] = useState<StreamedDelivery[]>(seed);
  const [state, setState] = useState<ConnState>("connecting");
  const [lastEvent, setLastEvent] = useState<number | null>(null);
  const [now, setNow] = useState(0);
  const seenIds = useRef<Set<number>>(new Set(seed.map((d) => d.id)));

  useEffect(() => {
    const es = new EventSource(`/api/webhook-stream?seed=${seedCount}`);

    const onDelivery = (ev: MessageEvent) => {
      try {
        const row = JSON.parse(ev.data) as StreamedDelivery;
        setRows((prev) => {
          // If row is already known (id seen via initial seed), replace it in place so
          // dispatch_status updates after the initial accept are reflected without
          // duplicating the row in the table.
          if (seenIds.current.has(row.id)) {
            return prev.map((p) => (p.id === row.id ? row : p));
          }
          seenIds.current.add(row.id);
          const next = [row, ...prev];
          return next.slice(0, 200);
        });
        setLastEvent(Date.now());
      } catch {
        // ignore bad lines
      }
    };

    const onReady = () => setState("live");
    const onHeartbeat = () => setLastEvent(Date.now());

    es.addEventListener("delivery", onDelivery as EventListener);
    es.addEventListener("ready", onReady as EventListener);
    es.addEventListener("heartbeat", onHeartbeat as EventListener);

    es.onerror = () => {
      // EventSource auto-reconnects; surface the transition.
      setState("reconnecting");
    };

    return () => {
      es.removeEventListener("delivery", onDelivery as EventListener);
      es.removeEventListener("ready", onReady as EventListener);
      es.removeEventListener("heartbeat", onHeartbeat as EventListener);
      es.close();
      setState("closed");
    };
  }, [seedCount]);

  // 1Hz now-state to keep "last event Xs ago" and fresh-row highlighting current without
  // calling Date.now() during render (Next 16 / React 19 react-hooks/purity rule).
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const lastEventSeconds =
    lastEvent !== null && now > 0 ? Math.max(0, Math.floor((now - lastEvent) / 1000)) : null;

  return (
    <div>
      <div className="flex items-center gap-2 mb-3 text-xs">
        <span
          className={
            "inline-flex items-center gap-1.5 px-2 py-0.5 rounded border font-mono " +
            (state === "live"
              ? "border-emerald-700/50 bg-emerald-900/20 text-emerald-400"
              : state === "reconnecting"
                ? "border-amber-700/50 bg-amber-900/20 text-amber-400"
                : "border-zinc-700 bg-zinc-900 text-zinc-400")
          }
        >
          <span
            className={
              "inline-block w-1.5 h-1.5 rounded-full " +
              (state === "live"
                ? "bg-emerald-400 animate-pulse"
                : state === "reconnecting"
                  ? "bg-amber-400"
                  : "bg-zinc-500")
            }
          />
          {state}
        </span>
        <span className="text-zinc-500 font-mono">SSE /api/webhook-stream</span>
        {lastEventSeconds !== null && (
          <span className="text-zinc-600 font-mono">
            last event {lastEventSeconds}s ago
          </span>
        )}
      </div>

      {rows.length === 0 ? (
        <div className="border border-zinc-800 rounded-lg p-10 text-center bg-zinc-950">
          <div className="text-sm text-zinc-400">No webhook deliveries yet.</div>
          <div className="text-xs text-zinc-600 mt-2">
            POST a signed payload to{" "}
            <code className="text-zinc-500">/api/webhooks/&lt;slug&gt;</code>; rows stream in
            without a refresh.
          </div>
        </div>
      ) : (
        <div className="border border-zinc-800 rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-zinc-900 text-zinc-400 text-xs uppercase tracking-wide">
              <tr>
                <th className="px-4 py-2.5 text-left">Received</th>
                <th className="px-4 py-2.5 text-left">Slug</th>
                <th className="px-4 py-2.5 text-left">Status</th>
                <th className="px-4 py-2.5 text-right">HTTP</th>
                <th className="px-4 py-2.5 text-left">Dispatch</th>
                <th className="px-4 py-2.5 text-left">Redact</th>
                <th className="px-4 py-2.5 text-left">Payload hash</th>
                <th className="px-4 py-2.5 text-left">Reason</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((d) => {
                const fresh = now > 0 && isFresh(d.received_at, now);
                return (
                  <tr
                    key={d.id}
                    className={
                      "border-t border-zinc-800 hover:bg-zinc-900/50 transition-colors " +
                      (fresh ? "bg-blue-950/20" : "")
                    }
                  >
                    <td className="px-4 py-2.5 text-zinc-400 font-mono text-xs">
                      {d.received_at.replace("T", " ").replace("Z", "")}
                    </td>
                    <td className="px-4 py-2.5 text-zinc-100 font-mono">{d.slug}</td>
                    <td className="px-4 py-2.5">
                      <Badge color={STATUS_COLOR[d.status] ?? STATUS_COLOR.error!}>
                        {d.status}
                      </Badge>
                    </td>
                    <td className="px-4 py-2.5 text-right text-zinc-300 font-mono tabular-nums text-xs">
                      {d.http_code}
                    </td>
                    <td className="px-4 py-2.5">
                      <Badge
                        color={
                          d.dispatch_status
                            ? DISPATCH_COLOR[d.dispatch_status] ?? DISPATCH_COLOR.skipped!
                            : "border-zinc-800 bg-zinc-900/40 text-zinc-600"
                        }
                        title={d.dispatch_target ? `target: ${d.dispatch_target}` : undefined}
                      >
                        {d.dispatch_status ?? "—"}
                      </Badge>
                    </td>
                    <td className="px-4 py-2.5 text-xs font-mono">
                      {d.redaction_applied ? (
                        <span className="text-amber-400">yes</span>
                      ) : (
                        <span className="text-zinc-600">no</span>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-zinc-500 font-mono text-xs">
                      {d.payload_hash.slice(0, 12)}…
                    </td>
                    <td
                      className="px-4 py-2.5 text-zinc-400 text-xs max-w-md truncate"
                      title={d.reason ?? ""}
                    >
                      {d.reason ?? <span className="text-zinc-600">—</span>}
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

function Badge({
  color,
  children,
  title,
}: {
  color: string;
  children: React.ReactNode;
  title?: string;
}) {
  return (
    <span
      className={"inline-block px-2 py-0.5 text-xs rounded border font-mono " + color}
      title={title}
    >
      {children}
    </span>
  );
}
