import { listWebhooks } from "@/lib/config";
import { RegistryEmpty } from "@/components/registry-empty";
import { RegistryHeader } from "@/components/registry-header";

export const dynamic = "force-dynamic";

export default async function WebhooksPage() {
  const { inbound, outbound } = await listWebhooks();
  const total = inbound.length + outbound.length;

  return (
    <div>
      <RegistryHeader
        title="Webhooks"
        count={total}
        source="yielde-bridge-config/webhook.json"
        hint="signing secrets by reference · replay archive in Phase 3"
      />

      <section className="mb-8">
        <h2 className="text-sm uppercase tracking-wide text-zinc-500 mb-3">
          Inbound{" "}
          <span className="text-zinc-600 font-mono normal-case">({inbound.length})</span>
        </h2>
        {inbound.length === 0 ? (
          <RegistryEmpty
            what="inbound webhooks"
            cli="bridge add webhook <slug> --target-skill <skill> --secret-ref <ref>"
          />
        ) : (
          <div className="border border-zinc-800 rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-zinc-900 text-zinc-400 text-xs uppercase tracking-wide">
                <tr>
                  <th className="px-4 py-2.5 text-left">Slug</th>
                  <th className="px-4 py-2.5 text-left">Target skill</th>
                  <th className="px-4 py-2.5 text-left">Secret ref</th>
                  <th className="px-4 py-2.5 text-left">Verify</th>
                </tr>
              </thead>
              <tbody>
                {inbound.map((w) => (
                  <tr key={w.slug} className="border-t border-zinc-800 hover:bg-zinc-900/50">
                    <td className="px-4 py-2.5 text-zinc-100 font-mono">{w.slug}</td>
                    <td className="px-4 py-2.5 text-zinc-300 font-mono text-xs">{w.targetSkill}</td>
                    <td className="px-4 py-2.5 text-zinc-400 font-mono text-xs">{w.secretRef}</td>
                    <td className="px-4 py-2.5">
                      <VerifyBadge verify={w.verifySig} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section>
        <h2 className="text-sm uppercase tracking-wide text-zinc-500 mb-3">
          Outbound{" "}
          <span className="text-zinc-600 font-mono normal-case">({outbound.length})</span>
        </h2>
        {outbound.length === 0 ? (
          <RegistryEmpty
            what="outbound webhooks"
            cli="bridge add webhook-out <name> --url <url> [--auth-ref <ref>]"
          />
        ) : (
          <div className="border border-zinc-800 rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-zinc-900 text-zinc-400 text-xs uppercase tracking-wide">
                <tr>
                  <th className="px-4 py-2.5 text-left">Name</th>
                  <th className="px-4 py-2.5 text-left">URL</th>
                  <th className="px-4 py-2.5 text-left">Auth ref</th>
                  <th className="px-4 py-2.5 text-right">Retry</th>
                </tr>
              </thead>
              <tbody>
                {outbound.map((w) => (
                  <tr key={w.name} className="border-t border-zinc-800 hover:bg-zinc-900/50">
                    <td className="px-4 py-2.5 text-zinc-100 font-mono">{w.name}</td>
                    <td className="px-4 py-2.5 text-zinc-400 font-mono text-xs max-w-md truncate">
                      {w.url}
                    </td>
                    <td className="px-4 py-2.5 text-zinc-400 font-mono text-xs">
                      {w.authRef ?? <span className="text-zinc-600">—</span>}
                    </td>
                    <td className="px-4 py-2.5 text-right text-zinc-500 font-mono tabular-nums text-xs">
                      {w.retryPolicy?.maxAttempts
                        ? `${w.retryPolicy.maxAttempts}×`
                        : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

function VerifyBadge({ verify }: { verify: string }) {
  if (verify === "none") {
    return (
      <span className="inline-block px-2 py-0.5 text-xs rounded border font-mono border-amber-700/50 bg-amber-900/20 text-amber-400">
        unsigned
      </span>
    );
  }
  return (
    <span className="inline-block px-2 py-0.5 text-xs rounded border font-mono border-emerald-700/50 bg-emerald-900/20 text-emerald-400">
      {verify}
    </span>
  );
}
