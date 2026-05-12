import Link from "next/link";
import { readUsage, historySeries } from "@/lib/usage";
import { listSkills, type SkillSummary } from "@/lib/skills";
import { Badge, type BadgeVariant } from "@/components/badge";
import { UsageSparkline } from "@/components/usage-sparkline";
import { RegistryHeader } from "@/components/registry-header";

export const dynamic = "force-dynamic";

function fmtLastUsed(iso: string | null | undefined): string {
  if (!iso) return "—";
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return iso;
  const delta = Math.max(0, Date.now() - t);
  const s = Math.floor(delta / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

type Row = {
  skill: SkillSummary | null;
  name: string;
  uses: number;
  lastUsed: string | null;
  history: number[];
};

export default async function SkillTracesPage() {
  const [skills, usage] = await Promise.all([listSkills(), readUsage()]);

  const skillByName = new Map<string, SkillSummary>();
  for (const s of skills) skillByName.set(s.name, s);

  const rows: Row[] = [];
  for (const [name, u] of Object.entries(usage.skills)) {
    rows.push({
      skill: skillByName.get(name) ?? null,
      name,
      uses: u.uses ?? 0,
      lastUsed: u.last_used ?? null,
      history: historySeries(u),
    });
  }
  rows.sort((a, b) => b.uses - a.uses);

  const orphanCount = rows.filter((r) => !r.skill).length;
  const totalUses = rows.reduce((sum, r) => sum + r.uses, 0);

  return (
    <div>
      <RegistryHeader
        title="Skill traces"
        count={rows.length}
        source="~/.claude/skills/.usage.json"
        hint={`${totalUses} total uses · ${orphanCount} entries with no matching SKILL.md`}
      />

      {rows.length === 0 ? (
        <div className="border border-zinc-800 rounded-lg p-10 text-center bg-zinc-950">
          <div className="text-sm text-zinc-400">No skill traces recorded yet.</div>
          <div className="text-xs text-zinc-600 mt-2">
            POST <code className="text-zinc-500">/api/skills/use</code> on every skill invocation
            to start populating telemetry.
          </div>
        </div>
      ) : (
        <div className="border border-zinc-800 rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-zinc-900 text-zinc-400 text-xs uppercase tracking-wide">
              <tr>
                <th className="px-4 py-2.5 text-left">Skill</th>
                <th className="px-4 py-2.5 text-left">Provenance</th>
                <th className="px-4 py-2.5 text-right">Uses</th>
                <th className="px-4 py-2.5 text-left">14-day history</th>
                <th className="px-4 py-2.5 text-left">Last used</th>
                <th className="px-4 py-2.5 text-left">Category</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const provenance = row.skill?.provenance ?? "orphan";
                const provVariant: BadgeVariant =
                  provenance === "yielde-native"
                    ? "info"
                    : provenance === "hermes-import"
                      ? "accent"
                      : provenance === "orphan"
                        ? "danger"
                        : "muted";
                return (
                  <tr key={row.name} className="border-t border-zinc-800 hover:bg-zinc-900/50">
                    <td className="px-4 py-2.5 font-mono text-zinc-100">
                      {row.skill ? (
                        <Link
                          href={`/configure/skills?skill=${encodeURIComponent(row.name)}`}
                          className="hover:text-blue-400"
                        >
                          {row.name}
                        </Link>
                      ) : (
                        row.name
                      )}
                    </td>
                    <td className="px-4 py-2.5">
                      <Badge variant={provVariant}>{provenance}</Badge>
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono tabular-nums text-zinc-200">
                      {row.uses}
                    </td>
                    <td className="px-4 py-2.5">
                      <UsageSparkline data={row.history} />
                    </td>
                    <td className="px-4 py-2.5 text-zinc-400 font-mono text-xs">
                      {fmtLastUsed(row.lastUsed)}
                    </td>
                    <td className="px-4 py-2.5 text-zinc-400 font-mono text-xs">
                      {row.skill?.category ?? <span className="text-zinc-600">—</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
