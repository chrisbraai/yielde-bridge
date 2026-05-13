import { listAllSkills } from "@/lib/skills";
import { listAgents } from "@/lib/agents";
import { LibraryNavLinks, type LibraryPanel } from "./library-nav-links";

export async function LibraryNav() {
  const [skills, agents] = await Promise.all([listAllSkills(), listAgents()]);
  const panels: LibraryPanel[] = [
    { href: "/library/skills", label: "Skills", count: skills.length },
    { href: "/library/agents", label: "Agents", count: agents.length },
  ];
  return (
    <div className="border-b border-zinc-800">
      <div className="max-w-7xl mx-auto px-6">
        <LibraryNavLinks panels={panels} />
      </div>
    </div>
  );
}
