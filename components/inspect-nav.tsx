import { listBrainInboxDrafts } from "@/lib/brain-inbox";
import { auditTotalLines, listAuditEvents } from "@/lib/audit";
import { readUsage } from "@/lib/usage";
import { buildSkillGraph } from "@/lib/skill-graph";
import { listHermesPendingDrafts } from "@/lib/hermes-pending";
import { InspectNavLinks, type InspectPanel } from "./inspect-nav-links";

export async function InspectNav() {
  const [drafts, audit, blockedEvents, usage, graph, pending] = await Promise.all([
    listBrainInboxDrafts(),
    auditTotalLines(),
    listAuditEvents({ event: "capability.blocked", limit: 1000 }),
    readUsage(),
    buildSkillGraph(),
    listHermesPendingDrafts(),
  ]);

  const panels: InspectPanel[] = [
    { href: "/inspect", label: "Overview", count: null },
    { href: "/inspect/audit-search", label: "Audit", count: audit },
    { href: "/inspect/brain-inbox", label: "Brain inbox", count: drafts.length },
    { href: "/inspect/capability-decisions", label: "Capability gates", count: blockedEvents.length },
    { href: "/inspect/skill-traces", label: "Skill traces", count: Object.keys(usage.skills).length },
    { href: "/inspect/skill-graph", label: "Skill graph", count: graph.stats.totalEdges },
    { href: "/inspect/hermes-pending", label: "Hermes pending", count: pending.length },
  ];

  return (
    <div className="border-b border-zinc-800">
      <div className="max-w-7xl mx-auto px-6">
        <InspectNavLinks panels={panels} />
      </div>
    </div>
  );
}
