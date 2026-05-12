import "server-only";
import { readFile } from "node:fs/promises";
import { listSkills, parseFrontmatter, skillsRoot } from "./skills";
import { join } from "node:path";
import { readdir, stat } from "node:fs/promises";

export type SkillNode = {
  name: string;
  category: string;
  provenance: string;
  description: string;
  relatedTo: string[];
  inDegree: number;
  outDegree: number;
};

export type SkillEdge = { from: string; to: string };

export type SkillGraph = {
  nodes: Map<string, SkillNode>;
  edges: SkillEdge[];
  orphanRefs: Array<{ from: string; missing: string }>;
  isolated: string[];
  bidirectional: SkillEdge[];
  stats: {
    totalNodes: number;
    totalEdges: number;
    orphanRefCount: number;
    isolatedCount: number;
    bidirectionalCount: number;
    topConnected: Array<{ name: string; degree: number }>;
  };
};

/**
 * Walk every SKILL.md in the skills root, parse `related_skills`, and build a directed graph.
 * Edges that go both ways are also surfaced as `bidirectional` for the UI to highlight strong
 * pairs. References to skills not present locally land in `orphanRefs` so the curator can
 * either import the dependency or strip the stale edge.
 */
export async function buildSkillGraph(): Promise<SkillGraph> {
  const summaries = await listSkills();
  const present = new Set(summaries.map((s) => s.name));

  const nodes = new Map<string, SkillNode>();
  for (const s of summaries) {
    nodes.set(s.name, {
      name: s.name,
      category: s.category,
      provenance: s.provenance,
      description: s.description,
      relatedTo: [],
      inDegree: 0,
      outDegree: 0,
    });
  }

  // Re-read each SKILL.md for related_skills (not exposed on the SkillSummary type).
  const root = skillsRoot();
  let categories: string[];
  try { categories = await readdir(root); } catch { categories = []; }
  for (const category of categories) {
    if (category.startsWith(".") || category === "INDEX.md") continue;
    const catPath = join(root, category);
    let st;
    try { st = await stat(catPath); } catch { continue; }
    if (!st.isDirectory()) continue;
    let names: string[];
    try { names = await readdir(catPath); } catch { continue; }
    for (const name of names) {
      if (name.startsWith(".")) continue;
      const skillFile = join(catPath, name, "SKILL.md");
      let src: string;
      try { src = await readFile(skillFile, "utf8"); } catch { continue; }
      const { fm } = parseFrontmatter(src);
      const skillName = fm.name || name;
      const node = nodes.get(skillName);
      if (!node) continue;
      const rel = Array.isArray(fm.related_skills) ? fm.related_skills : [];
      node.relatedTo = rel.map(String);
    }
  }

  const edges: SkillEdge[] = [];
  const orphanRefs: Array<{ from: string; missing: string }> = [];
  const edgeSet = new Set<string>();
  for (const node of nodes.values()) {
    for (const target of node.relatedTo) {
      if (!present.has(target)) {
        orphanRefs.push({ from: node.name, missing: target });
        continue;
      }
      const key = `${node.name}${target}`;
      if (edgeSet.has(key)) continue;
      edgeSet.add(key);
      edges.push({ from: node.name, to: target });
      node.outDegree += 1;
      const tgt = nodes.get(target);
      if (tgt) tgt.inDegree += 1;
    }
  }

  const bidirectional: SkillEdge[] = [];
  for (const e of edges) {
    const reverseKey = `${e.to}${e.from}`;
    if (edgeSet.has(reverseKey) && e.from < e.to) {
      bidirectional.push(e);
    }
  }

  const isolated: string[] = [];
  for (const node of nodes.values()) {
    if (node.inDegree === 0 && node.outDegree === 0) isolated.push(node.name);
  }
  isolated.sort();

  const topConnected = [...nodes.values()]
    .map((n) => ({ name: n.name, degree: n.inDegree + n.outDegree }))
    .filter((n) => n.degree > 0)
    .sort((a, b) => b.degree - a.degree)
    .slice(0, 20);

  return {
    nodes,
    edges,
    orphanRefs,
    isolated,
    bidirectional,
    stats: {
      totalNodes: nodes.size,
      totalEdges: edges.length,
      orphanRefCount: orphanRefs.length,
      isolatedCount: isolated.length,
      bidirectionalCount: bidirectional.length,
      topConnected,
    },
  };
}
