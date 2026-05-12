import { registryCounts } from "@/lib/config";
import { listSkills } from "@/lib/skills";
import { ConfigureNavLinks, type ConfigurePanel } from "./configure-nav-links";

export async function ConfigureNav() {
  const [counts, skills] = await Promise.all([registryCounts(), listSkills()]);
  const panels: ConfigurePanel[] = [
    { href: "/configure/mcp", label: "MCP", count: counts.mcp },
    { href: "/configure/api", label: "API", count: counts.api },
    { href: "/configure/webhooks", label: "Webhooks", count: counts.webhooks },
    { href: "/configure/skills", label: "Skills", count: skills.length },
    { href: "/configure/secret-refs", label: "Secrets", count: counts.secrets },
    { href: "/configure/capabilities", label: "Capabilities", count: counts.capabilities },
  ];
  return (
    <div className="border-b border-zinc-800">
      <div className="max-w-7xl mx-auto px-6">
        <ConfigureNavLinks panels={panels} />
      </div>
    </div>
  );
}
