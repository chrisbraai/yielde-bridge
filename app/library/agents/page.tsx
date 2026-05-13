import { listAgents } from "@/lib/agents";
import { readPins } from "@/lib/pins";
import { LibraryList, type LibraryItem } from "@/components/library-list";
import type { BadgeVariant } from "@/components/badge";

export const dynamic = "force-dynamic";

const RUNTIME_VARIANT: Record<string, BadgeVariant> = {
  "claude-subagent": "info",
  "n8n-workflow": "accent",
  cron: "warn",
  "mcp-tool": "muted",
};

const STATUS_VARIANT: Record<string, BadgeVariant> = {
  verified: "success",
  active: "success",
  draft: "warn",
  retired: "danger",
};

export default async function LibraryAgentsPage() {
  const [agents, pins] = await Promise.all([listAgents(), readPins()]);
  const pinned = new Set(pins.agents);

  const items: LibraryItem[] = agents.map((a) => {
    const badges: LibraryItem["badges"] = [];
    badges.push({
      label: a.runtime,
      variant: RUNTIME_VARIANT[a.runtime] ?? "muted",
      title: "runtime",
    });
    badges.push({ label: a.model, variant: "muted", title: "model" });
    if (a.status && a.status !== "—") {
      badges.push({
        label: a.status,
        variant: STATUS_VARIANT[a.status] ?? "muted",
        title: "status",
      });
    }
    if (a.schedule) {
      badges.push({ label: a.schedule, variant: "warn", title: "cron schedule" });
    }
    for (const cap of a.capabilityRequirements) {
      badges.push({ label: cap, variant: "danger", title: "requires capability" });
    }
    return {
      name: a.name,
      description: a.description,
      category: a.runtime,
      pinned: pinned.has(a.name),
      badges,
    };
  });

  return (
    <div>
      <header className="mb-6">
        <h1 className="text-xl font-semibold text-zinc-100">Agents</h1>
        <p className="text-sm text-zinc-500 mt-1">
          Operator agents in <code className="text-zinc-400 text-xs">~/.claude/operator/agents/</code>.
          Click a card to copy the agent name; click the pin to lock it to the top of its column.
        </p>
      </header>
      <LibraryList items={items} kind="agent" emptyHint="No operator agents found." />
    </div>
  );
}
