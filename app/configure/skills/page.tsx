import Link from "next/link";
import { listSkills } from "@/lib/skills";
import { Badge, type BadgeVariant } from "@/components/badge";
import { ImportHermesDialog } from "@/components/import-hermes-dialog";
import { UsageSparkline } from "@/components/usage-sparkline";

export const dynamic = "force-dynamic";

export default async function SkillsPage() {
  const skills = await listSkills();

  return (
    <div>
      <header className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold text-zinc-100">Skills</h1>
          <p className="text-sm text-zinc-500 mt-1">
            {skills.length} installed · sourced from <code className="text-zinc-400 text-xs">~/.claude/skills/</code>
          </p>
        </div>
        <div className="flex items-center gap-2">
          <ImportHermesDialog />
          <button
            disabled
            title="Coming in Phase 6"
            className="px-3 py-1.5 text-xs rounded-md border border-zinc-800 text-zinc-500 cursor-not-allowed"
          >
            Run curator (dry)
          </button>
        </div>
      </header>

      {skills.length === 0 ? (
        <div className="border border-zinc-800 rounded-lg p-12 text-center text-zinc-500">
          No skills found in <code className="text-zinc-400">~/.claude/skills/</code>.
        </div>
      ) : (
        <div className="border border-zinc-800 rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-zinc-900 text-zinc-400 text-xs uppercase tracking-wide">
              <tr>
                <th className="px-4 py-2.5 text-left w-8"></th>
                <th className="px-4 py-2.5 text-left">Category</th>
                <th className="px-4 py-2.5 text-left">Name</th>
                <th className="px-4 py-2.5 text-left">Description</th>
                <th className="px-4 py-2.5 text-left">Provenance</th>
                <th className="px-4 py-2.5 text-left">14-day</th>
                <th className="px-4 py-2.5 text-right">Uses</th>
                <th className="px-4 py-2.5 text-right">Version</th>
              </tr>
            </thead>
            <tbody>
              {skills.map((s) => (
                <tr
                  key={`${s.category}/${s.name}`}
                  className="border-t border-zinc-800 hover:bg-zinc-900/50"
                >
                  <td className="px-4 py-2.5 text-center">{s.pinned ? "📌" : ""}</td>
                  <td className="px-4 py-2.5 text-zinc-400 font-mono text-xs">{s.category}</td>
                  <td className="px-4 py-2.5">
                    <Link
                      href={`/configure/skills/${encodeURIComponent(s.category)}/${encodeURIComponent(s.name)}`}
                      className="text-zinc-100 font-mono hover:text-blue-400"
                    >
                      {s.name}
                    </Link>
                  </td>
                  <td className="px-4 py-2.5 text-zinc-400 max-w-md truncate" title={s.description}>
                    {s.description}
                  </td>
                  <td className="px-4 py-2.5">
                    <ProvenanceBadge provenance={s.provenance} />
                  </td>
                  <td className="px-4 py-2.5">
                    <UsageSparkline data={s.history ?? []} />
                  </td>
                  <td className="px-4 py-2.5 text-right text-zinc-500 font-mono tabular-nums">
                    {s.uses ?? 0}
                  </td>
                  <td className="px-4 py-2.5 text-right text-zinc-500 font-mono text-xs">
                    {s.version}
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

const PROVENANCE_VARIANT: Record<string, BadgeVariant> = {
  "yielde-native": "success",
  "hermes-import": "info",
  "auto-generated": "warn",
};

function ProvenanceBadge({ provenance }: { provenance: string }) {
  return <Badge variant={PROVENANCE_VARIANT[provenance] ?? "muted"}>{provenance}</Badge>;
}
