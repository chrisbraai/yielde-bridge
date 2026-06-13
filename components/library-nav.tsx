import { listAllSkills } from "@/lib/skills";
import { listAgents } from "@/lib/agents";
import { listScripts } from "@/lib/scripts";
import { listCapabilities, isAffirmative } from "@/lib/config";
import { LibraryNavLinks, type LibraryPanel } from "./library-nav-links";

export async function LibraryNav() {
  const [skills, agents, scripts, capabilities] = await Promise.all([
    listAllSkills(),
    listAgents(),
    listScripts(),
    listCapabilities(),
  ]);
  const panels: LibraryPanel[] = [
    { href: "/library/skills", label: "Skills", count: skills.length },
    { href: "/library/agents", label: "Agents", count: agents.length },
    { href: "/library/scripts", label: "Scripts", count: scripts.length },
    { href: "/library/capabilities", label: "Capabilities", count: capabilities.filter(isAffirmative).length },
  ];
  return (
    <div className="border-b border-zinc-800">
      <div className="max-w-7xl mx-auto px-6">
        <LibraryNavLinks panels={panels} />
      </div>
    </div>
  );
}
