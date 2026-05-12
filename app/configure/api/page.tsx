import { listApiConnectors } from "@/lib/config";
import { Badge, type BadgeVariant } from "@/components/badge";
import { RegistryEmpty } from "@/components/registry-empty";
import { RegistryHeader } from "@/components/registry-header";

export const dynamic = "force-dynamic";

export default async function ApiPage() {
  const connectors = await listApiConnectors();

  return (
    <div>
      <RegistryHeader
        title="API Connectors"
        count={connectors.length}
        source="yielde-bridge-config/api.json"
        hint="auth methods and rate limits per provider"
      />

      {connectors.length === 0 ? (
        <RegistryEmpty
          what="API connectors"
          cli="bridge add api <name> --base-url <url> --auth-ref <ref>"
        />
      ) : (
        <div className="border border-zinc-800 rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-zinc-900 text-zinc-400 text-xs uppercase tracking-wide">
              <tr>
                <th className="px-4 py-2.5 text-left">Name</th>
                <th className="px-4 py-2.5 text-left">Base URL</th>
                <th className="px-4 py-2.5 text-left">Auth</th>
                <th className="px-4 py-2.5 text-left">Secret ref</th>
                <th className="px-4 py-2.5 text-right">Rate limit</th>
              </tr>
            </thead>
            <tbody>
              {connectors.map((c) => (
                <tr key={c.name} className="border-t border-zinc-800 hover:bg-zinc-900/50">
                  <td className="px-4 py-2.5 text-zinc-100 font-mono">{c.name}</td>
                  <td className="px-4 py-2.5 text-zinc-400 font-mono text-xs max-w-md truncate">
                    {c.baseUrl}
                  </td>
                  <td className="px-4 py-2.5">
                    <AuthBadge method={c.authMethod ?? "bearer"} />
                  </td>
                  <td className="px-4 py-2.5 text-zinc-400 font-mono text-xs">{c.authRef}</td>
                  <td className="px-4 py-2.5 text-right text-zinc-500 font-mono tabular-nums text-xs">
                    {c.rateLimit?.rpm ? `${c.rateLimit.rpm}/min` : "—"}
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

const AUTH_VARIANT: Record<string, BadgeVariant> = {
  bearer: "success",
  "api-key": "info",
  oauth: "accent",
  basic: "warn",
  none: "muted",
};

function AuthBadge({ method }: { method: string }) {
  return <Badge variant={AUTH_VARIANT[method] ?? "muted"}>{method}</Badge>;
}
