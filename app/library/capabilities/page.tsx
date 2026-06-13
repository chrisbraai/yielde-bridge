import { listCapabilities, isAffirmative, type Capability } from "@/lib/config";
import { Badge } from "@/components/badge";
import { RegistryHeader } from "@/components/registry-header";
import { CapabilityRemoveButton } from "@/components/capability-remove-button";

export const dynamic = "force-dynamic";

// This tab lists ONLY what the agent CAN do (affirmative / available capabilities).
// Refusal boundaries (available:false) stay in registry.json for the OS PreToolUse gate and
// the agent's safety self-knowledge — they are intentionally not surfaced here.

type Section = "active" | "installable" | "privileged";

const SECTION_LABEL: Record<Section, string> = {
  active: "Active — agentic tooling loaded and ready",
  installable: "Installable — free & open-source, one command to enable",
  privileged: "Privileged operations — available, some need your confirmation",
};

const SECTION_HINT: Record<Section, string> = {
  active: "MCP servers installed user-scope. Tools surface as mcp__<name>__* after a Claude Code restart.",
  installable: "Run the install command in each entry's registry.json `install` field, then register it under category G.",
  privileged: "Real powers the agent holds. Confirm-gated ones trigger a native go/no-go prompt before they run.",
};

const SECTION_ORDER: Section[] = ["active", "installable", "privileged"];

function sectionOf(c: Capability): Section {
  if (c.category === "G") return c.status === "active" ? "active" : "installable";
  return "privileged";
}

export default async function CapabilitiesPage() {
  const all = await listCapabilities();
  const can = all.filter(isAffirmative);
  const boundaries = all.length - can.length;

  const bySection = new Map<Section, Capability[]>();
  for (const c of can) {
    const s = sectionOf(c);
    const arr = bySection.get(s) ?? [];
    arr.push(c);
    bySection.set(s, arr);
  }

  const activeCount = bySection.get("active")?.length ?? 0;
  const installCount = bySection.get("installable")?.length ?? 0;
  const privCount = bySection.get("privileged")?.length ?? 0;

  return (
    <div>
      <RegistryHeader
        title="Capabilities"
        count={can.length}
        source="~/.claude/os/capabilities/registry.json"
        hint={`what I can do · ${activeCount} active · ${installCount} installable · ${privCount} privileged`}
      />

      {can.length === 0 ? (
        <div className="border border-zinc-800 rounded-lg p-10 text-center text-zinc-500 text-sm">
          No capabilities available yet. Yielde OS expected at{" "}
          <code className="text-zinc-400">~/.claude/os/capabilities/registry.json</code>.
        </div>
      ) : (
        SECTION_ORDER.filter((s) => bySection.has(s)).map((s) => {
          const list = bySection.get(s)!;
          return (
            <section key={s} className="mb-8">
              <h2 className="text-sm uppercase tracking-wide text-zinc-300 mb-1">
                {SECTION_LABEL[s]}
                <span className="text-zinc-600 font-mono normal-case ml-2">({list.length})</span>
              </h2>
              <p className="text-xs text-zinc-500 mb-3">{SECTION_HINT[s]}</p>
              <div className="border border-zinc-800 rounded-lg overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-zinc-900 text-zinc-400 text-xs uppercase tracking-wide">
                    <tr>
                      <th className="px-4 py-2.5 text-left">Name</th>
                      <th className="px-4 py-2.5 text-left">Capability</th>
                      <th className="px-4 py-2.5 text-left">Status</th>
                      <th className="px-2 py-2.5 w-8" />
                    </tr>
                  </thead>
                  <tbody>
                    {list.map((c) => (
                      <tr key={c.name} className="border-t border-zinc-800 hover:bg-zinc-900/50">
                        <td className="px-4 py-2.5 text-zinc-100 font-mono whitespace-nowrap">{c.name}</td>
                        <td className="px-4 py-2.5 text-zinc-300 max-w-xl" title={c.why || c.title}>
                          {c.title}
                        </td>
                        <td className="px-4 py-2.5">
                          <StatusBadge c={c} />
                        </td>
                        <td className="px-2 py-1.5 text-right">
                          <CapabilityRemoveButton name={c.name} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          );
        })
      )}

      {boundaries > 0 && (
        <p className="text-xs text-zinc-600 mt-2">
          {boundaries} operational boundaries are enforced by the Yielde OS gate (in{" "}
          <code className="text-zinc-500">registry.json</code>) and omitted here by design — this view lists
          only what the agent can do.
        </p>
      )}
    </div>
  );
}

// Positive status badge — every row here is something the agent CAN do.
function StatusBadge({ c }: { c: Capability }) {
  if (c.category === "G") {
    if (c.status === "active") return <Badge variant="success">active</Badge>;
    return <Badge variant="info">installable</Badge>;
  }
  if (c.confirmGate) return <Badge variant="accent">confirm to run</Badge>;
  return <Badge variant="success">ready</Badge>;
}
