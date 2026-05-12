import { listSecretRefs } from "@/lib/config";
import { RegistryEmpty } from "@/components/registry-empty";
import { RegistryHeader } from "@/components/registry-header";

export const dynamic = "force-dynamic";

export default async function SecretRefsPage() {
  const refs = await listSecretRefs();

  return (
    <div>
      <RegistryHeader
        title="Secret references"
        count={refs.length}
        source="yielde-bridge-config/secret-refs.json"
        hint="references only — values live in Infisical / keychain / env / gh-secret"
      />

      <div className="mb-4 px-4 py-2.5 rounded-md border border-amber-900/40 bg-amber-950/20 text-xs text-amber-300">
        Bridge never reads or displays credential values. If a literal token ever appears here, rotate it immediately.
      </div>

      {refs.length === 0 ? (
        <RegistryEmpty
          what="secret references"
          cli="bridge add secret-ref <name> --provider infisical --path <path>"
        />
      ) : (
        <div className="border border-zinc-800 rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-zinc-900 text-zinc-400 text-xs uppercase tracking-wide">
              <tr>
                <th className="px-4 py-2.5 text-left">Name</th>
                <th className="px-4 py-2.5 text-left">Provider</th>
                <th className="px-4 py-2.5 text-left">Path</th>
                <th className="px-4 py-2.5 text-right">Last rotated</th>
              </tr>
            </thead>
            <tbody>
              {refs.map((r) => (
                <tr key={r.name} className="border-t border-zinc-800 hover:bg-zinc-900/50">
                  <td className="px-4 py-2.5 text-zinc-100 font-mono">{r.name}</td>
                  <td className="px-4 py-2.5">
                    <ProviderBadge provider={r.provider} />
                  </td>
                  <td className="px-4 py-2.5 text-zinc-400 font-mono text-xs max-w-md truncate">
                    {r.path}
                  </td>
                  <td className="px-4 py-2.5 text-right text-zinc-500 font-mono text-xs tabular-nums">
                    {r.lastRotated ?? "—"}
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

function ProviderBadge({ provider }: { provider: string }) {
  const styles: Record<string, string> = {
    infisical: "border-emerald-700/50 bg-emerald-900/20 text-emerald-400",
    "os-keychain": "border-blue-700/50 bg-blue-900/20 text-blue-400",
    env: "border-amber-700/50 bg-amber-900/20 text-amber-400",
    "gh-secret": "border-purple-700/50 bg-purple-900/20 text-purple-400",
  };
  const cls = styles[provider] || "border-zinc-700 bg-zinc-900 text-zinc-400";
  return (
    <span className={`inline-block px-2 py-0.5 text-xs rounded border font-mono ${cls}`}>
      {provider}
    </span>
  );
}
