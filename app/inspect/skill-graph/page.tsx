import Link from "next/link";
import { buildSkillGraph } from "@/lib/skill-graph";
import { Badge, type BadgeVariant } from "@/components/badge";
import { RegistryHeader } from "@/components/registry-header";

export const dynamic = "force-dynamic";

function provenanceVariant(p: string): BadgeVariant {
  if (p === "yielde-native") return "info";
  if (p === "hermes-import") return "accent";
  if (p === "auto-generated") return "warn";
  return "muted";
}

export default async function SkillGraphPage() {
  const graph = await buildSkillGraph();
  const nodes = [...graph.nodes.values()];
  nodes.sort((a, b) => {
    const deg = (b.inDegree + b.outDegree) - (a.inDegree + a.outDegree);
    if (deg !== 0) return deg;
    return a.name.localeCompare(b.name);
  });

  const incomingByName = new Map<string, string[]>();
  for (const edge of graph.edges) {
    if (!incomingByName.has(edge.to)) incomingByName.set(edge.to, []);
    incomingByName.get(edge.to)!.push(edge.from);
  }

  const bidirSet = new Set(graph.bidirectional.flatMap((e) => [`${e.from}${e.to}`, `${e.to}${e.from}`]));

  return (
    <div>
      <RegistryHeader
        title="Skill provenance graph"
        count={graph.stats.totalNodes}
        source="~/.claude/skills/**/SKILL.md: related_skills frontmatter"
        hint={`${graph.stats.totalEdges} edges · ${graph.stats.bidirectionalCount} bidirectional · ${graph.stats.isolatedCount} isolated · ${graph.stats.orphanRefCount} orphan refs`}
      />

      <div className="grid grid-cols-[1fr_320px] gap-6">
        <div className="space-y-6">
          <section>
            <h2 className="text-xs uppercase tracking-wide text-zinc-500 mb-3">
              Skills by connectivity
            </h2>
            <div className="border border-zinc-800 rounded-lg overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-zinc-900 text-zinc-400 text-xs uppercase tracking-wide">
                  <tr>
                    <th className="px-4 py-2.5 text-left">Skill</th>
                    <th className="px-4 py-2.5 text-left">Provenance</th>
                    <th className="px-4 py-2.5 text-right">Out</th>
                    <th className="px-4 py-2.5 text-right">In</th>
                    <th className="px-4 py-2.5 text-left">Related to</th>
                    <th className="px-4 py-2.5 text-left">Referenced by</th>
                  </tr>
                </thead>
                <tbody>
                  {nodes.map((node) => {
                    const incoming = incomingByName.get(node.name) ?? [];
                    return (
                      <tr key={node.name} className="border-t border-zinc-800 hover:bg-zinc-900/50 align-top">
                        <td className="px-4 py-2.5 font-mono text-zinc-100">
                          <Link
                            href={`/configure/skills?skill=${encodeURIComponent(node.name)}`}
                            className="hover:text-blue-400"
                          >
                            {node.name}
                          </Link>
                          <div className="text-[11px] text-zinc-600 font-sans mt-0.5 line-clamp-1">
                            {node.description || "—"}
                          </div>
                        </td>
                        <td className="px-4 py-2.5">
                          <Badge variant={provenanceVariant(node.provenance)} size="sm">
                            {node.provenance}
                          </Badge>
                        </td>
                        <td className="px-4 py-2.5 text-right font-mono tabular-nums text-zinc-200">
                          {node.outDegree}
                        </td>
                        <td className="px-4 py-2.5 text-right font-mono tabular-nums text-zinc-200">
                          {node.inDegree}
                        </td>
                        <td className="px-4 py-2.5">
                          {node.relatedTo.length === 0 ? (
                            <span className="text-zinc-600 text-xs">—</span>
                          ) : (
                            <div className="flex flex-wrap gap-1">
                              {node.relatedTo.map((rel) => {
                                const isPresent = graph.nodes.has(rel);
                                const isBidir = bidirSet.has(`${node.name}${rel}`);
                                if (!isPresent) {
                                  return (
                                    <Badge key={rel} variant="danger" size="sm">
                                      {rel} (missing)
                                    </Badge>
                                  );
                                }
                                return (
                                  <Badge key={rel} variant={isBidir ? "success" : "muted"} size="sm">
                                    {isBidir ? "↔ " : "→ "}
                                    {rel}
                                  </Badge>
                                );
                              })}
                            </div>
                          )}
                        </td>
                        <td className="px-4 py-2.5">
                          {incoming.length === 0 ? (
                            <span className="text-zinc-600 text-xs">—</span>
                          ) : (
                            <div className="flex flex-wrap gap-1">
                              {incoming.map((src) => (
                                <Badge key={src} variant="muted" size="sm">
                                  ← {src}
                                </Badge>
                              ))}
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>

          {graph.orphanRefs.length > 0 && (
            <section>
              <h2 className="text-xs uppercase tracking-wide text-zinc-500 mb-3">
                Orphan references
              </h2>
              <div className="border border-zinc-800 rounded-lg p-4 bg-zinc-950">
                <p className="text-xs text-zinc-500 mb-3">
                  These skills declare a <code className="text-zinc-300">related_skills:</code> name that
                  does not exist locally. Either import the missing skill or strip the reference.
                </p>
                <ul className="space-y-1.5 text-sm">
                  {graph.orphanRefs.map((ref, i) => (
                    <li key={`${ref.from}-${ref.missing}-${i}`} className="font-mono text-xs">
                      <span className="text-zinc-300">{ref.from}</span>
                      <span className="text-zinc-600"> → </span>
                      <span className="text-rose-300">{ref.missing}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </section>
          )}
        </div>

        <aside className="space-y-6 self-start">
          <div className="border border-zinc-800 rounded-lg bg-zinc-950 p-4">
            <h2 className="text-xs uppercase tracking-wide text-zinc-500 mb-3">
              Top connected
            </h2>
            {graph.stats.topConnected.length === 0 ? (
              <div className="text-xs text-zinc-600">No edges yet.</div>
            ) : (
              <ul className="space-y-1.5">
                {graph.stats.topConnected.map((row) => (
                  <li key={row.name} className="flex items-center justify-between gap-2">
                    <span className="font-mono text-xs text-zinc-200 truncate">{row.name}</span>
                    <span className="font-mono text-xs text-zinc-500 tabular-nums">{row.degree}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {graph.isolated.length > 0 && (
            <div className="border border-zinc-800 rounded-lg bg-zinc-950 p-4">
              <h2 className="text-xs uppercase tracking-wide text-zinc-500 mb-3">
                Isolated skills
              </h2>
              <p className="text-[11px] text-zinc-600 mb-2">
                Declare no related_skills, and are not referenced by any skill that does.
              </p>
              <ul className="space-y-1 text-xs font-mono text-zinc-400">
                {graph.isolated.slice(0, 30).map((name) => (
                  <li key={name} className="truncate">{name}</li>
                ))}
                {graph.isolated.length > 30 && (
                  <li className="text-zinc-600 italic font-sans">
                    +{graph.isolated.length - 30} more
                  </li>
                )}
              </ul>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
