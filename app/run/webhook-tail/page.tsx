import { listRecentWebhookDeliveries } from "@/lib/runtime";
import { listWebhooks } from "@/lib/config";
import { RegistryHeader } from "@/components/registry-header";

export const dynamic = "force-dynamic";

export default async function WebhookTailPage() {
  const [deliveries, { inbound }] = await Promise.all([
    Promise.resolve(listRecentWebhookDeliveries(100)),
    listWebhooks(),
  ]);

  return (
    <div>
      <RegistryHeader
        title="Webhook tail"
        count={deliveries.length}
        source="runtime.db: webhook_deliveries"
        hint={`${inbound.length} inbound slug${inbound.length === 1 ? "" : "s"} configured · last 100 deliveries · 100/slug retention`}
      />

      {deliveries.length === 0 ? (
        <div className="border border-zinc-800 rounded-lg p-10 text-center bg-zinc-950">
          <div className="text-sm text-zinc-400">No webhook deliveries yet.</div>
          <div className="text-xs text-zinc-600 mt-2">
            POST a signed payload to{" "}
            <code className="text-zinc-500">/api/webhooks/&lt;slug&gt;</code> for any inbound slug
            in <code className="text-zinc-500">webhook.json</code>.
          </div>
          {inbound.length > 0 && (
            <div className="mt-4 text-xs text-zinc-500">
              Configured slugs:{" "}
              {inbound.map((w) => (
                <code key={w.slug} className="mx-1 px-1.5 py-0.5 bg-zinc-900 rounded text-zinc-400">
                  {w.slug}
                </code>
              ))}
            </div>
          )}
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
                <th className="px-4 py-2.5 text-left">Source IP</th>
                <th className="px-4 py-2.5 text-left">Payload hash</th>
                <th className="px-4 py-2.5 text-left">Reason</th>
              </tr>
            </thead>
            <tbody>
              {deliveries.map((d) => {
                const color =
                  d.status === "accepted"
                    ? "border-emerald-700/50 bg-emerald-900/20 text-emerald-400"
                    : d.status === "rejected"
                      ? "border-amber-700/50 bg-amber-900/20 text-amber-400"
                      : "border-rose-700/50 bg-rose-900/20 text-rose-400";
                return (
                  <tr key={d.id} className="border-t border-zinc-800 hover:bg-zinc-900/50">
                    <td className="px-4 py-2.5 text-zinc-400 font-mono text-xs">
                      {d.received_at.replace("T", " ").replace("Z", "")}
                    </td>
                    <td className="px-4 py-2.5 text-zinc-100 font-mono">{d.slug}</td>
                    <td className="px-4 py-2.5">
                      <span
                        className={"inline-block px-2 py-0.5 text-xs rounded border font-mono " + color}
                      >
                        {d.status}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-right text-zinc-300 font-mono tabular-nums text-xs">
                      {d.http_code}
                    </td>
                    <td className="px-4 py-2.5 text-zinc-500 font-mono text-xs">
                      {d.source_ip ?? "—"}
                    </td>
                    <td className="px-4 py-2.5 text-zinc-500 font-mono text-xs">
                      {d.payload_hash.slice(0, 12)}…
                    </td>
                    <td className="px-4 py-2.5 text-zinc-400 text-xs max-w-md truncate" title={d.reason ?? ""}>
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
