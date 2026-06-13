import { registryCounts } from "@/lib/config";
import { ConfigureNavLinks, type ConfigurePanel } from "./configure-nav-links";

export async function ConfigureNav() {
  const counts = await registryCounts();
  const panels: ConfigurePanel[] = [
    { href: "/configure/mcp", label: "MCP", count: counts.mcp },
    { href: "/configure/api", label: "API", count: counts.api },
    { href: "/configure/webhooks", label: "Webhooks", count: counts.webhooks },
    { href: "/configure/secret-refs", label: "Secrets", count: counts.secrets },
  ];
  return (
    <div className="border-b border-zinc-800">
      <div className="max-w-7xl mx-auto px-6">
        <ConfigureNavLinks panels={panels} />
      </div>
    </div>
  );
}
