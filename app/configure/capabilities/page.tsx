import { listCapabilities } from "@/lib/config";
import { Badge } from "@/components/badge";
import { RegistryHeader } from "@/components/registry-header";

export const dynamic = "force-dynamic";

const CATEGORY_LABEL: Record<string, string> = {
  A: "Authority — escalate to Chris",
  B: "Capability — agent does not do well",
  C: "Knowledge — state not reliably known",
  D: "Process — always human-in-loop",
  E: "Self-knowledge — epistemic limits",
  F: "Resource — operational guardrails",
};

export default async function CapabilitiesPage() {
  const caps = await listCapabilities();
  const byCategory = new Map<string, typeof caps>();
  for (const c of caps) {
    const arr = byCategory.get(c.category) ?? [];
    arr.push(c);
    byCategory.set(c.category, arr);
  }
  const hardGated = caps.filter((c) => c.hardGate).length;

  return (
    <div>
      <RegistryHeader
        title="Capabilities"
        count={caps.length}
        source="~/.claude/os/capabilities/registry.json"
        hint={`${hardGated} hard-gated · read-only mirror of Yielde OS`}
      />

      {caps.length === 0 ? (
        <div className="border border-zinc-800 rounded-lg p-10 text-center text-zinc-500 text-sm">
          No capabilities registered. Yielde OS expected at{" "}
          <code className="text-zinc-400">~/.claude/os/capabilities/registry.json</code>.
        </div>
      ) : (
        Array.from(byCategory.entries())
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([cat, list]) => (
            <section key={cat} className="mb-8">
              <h2 className="text-sm uppercase tracking-wide text-zinc-500 mb-3">
                <span className="text-zinc-300 font-mono mr-2">{cat}</span>
                {CATEGORY_LABEL[cat] ?? cat}
                <span className="text-zinc-600 font-mono normal-case ml-2">({list.length})</span>
              </h2>
              <div className="border border-zinc-800 rounded-lg overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-zinc-900 text-zinc-400 text-xs uppercase tracking-wide">
                    <tr>
                      <th className="px-4 py-2.5 text-left">Name</th>
                      <th className="px-4 py-2.5 text-left">Title</th>
                      <th className="px-4 py-2.5 text-left">Gate</th>
                      <th className="px-4 py-2.5 text-right">Reviewed</th>
                    </tr>
                  </thead>
                  <tbody>
                    {list.map((c) => (
                      <tr key={c.name} className="border-t border-zinc-800 hover:bg-zinc-900/50">
                        <td className="px-4 py-2.5 text-zinc-100 font-mono">{c.name}</td>
                        <td
                          className="px-4 py-2.5 text-zinc-300 max-w-md truncate"
                          title={c.refusal || c.title}
                        >
                          {c.title}
                        </td>
                        <td className="px-4 py-2.5">
                          <GateBadge available={c.available} hardGate={c.hardGate} />
                        </td>
                        <td className="px-4 py-2.5 text-right text-zinc-500 font-mono text-xs tabular-nums">
                          {c.lastReviewed ?? "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          ))
      )}
    </div>
  );
}

function GateBadge({ available, hardGate }: { available: boolean; hardGate: boolean }) {
  if (hardGate) return <Badge variant="danger">hard-gate</Badge>;
  if (!available) return <Badge variant="warn">refused</Badge>;
  return <Badge variant="success">allowed</Badge>;
}
