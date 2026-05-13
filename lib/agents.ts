import "server-only";
import { readdir, readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import { homedir } from "node:os";
import { parseFrontmatter } from "./skills";

// Operator agents live at ~/.claude/operator/agents/*.md. Each is a markdown file
// with YAML frontmatter (name, description, runtime, model, tools, mcps, …) plus a
// body that defines the agent's SOP. Underscore-prefixed files are templates/smokes.

export function operatorAgentsRoot(): string {
  if (process.env.YIELDE_OPERATOR_DIR) {
    return join(process.env.YIELDE_OPERATOR_DIR, "agents");
  }
  return join(homedir(), ".claude", "operator", "agents");
}

export type AgentSummary = {
  name: string;
  description: string;
  runtime: string;
  model: string;
  version: string;
  status: string;
  tools: string[];
  mcps: string[];
  capabilityRequirements: string[];
  schedule: string | null;
  path: string;
};

type AgentFrontmatter = {
  name?: string;
  description?: string;
  runtime?: string;
  model?: string;
  version?: number | string;
  status?: string;
  tools?: string[] | string;
  mcps?: string[] | string;
  capability_requirements?: string[] | string;
  schedule?: string;
};

function toArray(val: unknown): string[] {
  if (Array.isArray(val)) return val.map((x) => String(x)).filter(Boolean);
  if (typeof val === "string" && val.trim()) {
    return val
      .replace(/^\[|\]$/g, "")
      .split(",")
      .map((s) => s.trim().replace(/^["']|["']$/g, ""))
      .filter(Boolean);
  }
  return [];
}

export async function listAgents(): Promise<AgentSummary[]> {
  const root = operatorAgentsRoot();
  let files: string[];
  try {
    files = await readdir(root);
  } catch {
    return [];
  }

  const out: AgentSummary[] = [];

  for (const file of files) {
    if (!file.endsWith(".md")) continue;
    if (file.startsWith("_")) continue; // _template, _smoke-test, _n8n-smoke
    const path = join(root, file);
    let st;
    try { st = await stat(path); } catch { continue; }
    if (!st.isFile()) continue;

    let src: string;
    try { src = await readFile(path, "utf8"); } catch { continue; }

    const { fm } = parseFrontmatter(src) as unknown as { fm: AgentFrontmatter };
    const name = fm.name || file.replace(/\.md$/, "");

    out.push({
      name,
      description: fm.description || "",
      runtime: fm.runtime || "unknown",
      model: fm.model || "—",
      version: String(fm.version ?? "1"),
      status: fm.status || "—",
      tools: toArray(fm.tools),
      mcps: toArray(fm.mcps),
      capabilityRequirements: toArray(fm.capability_requirements),
      schedule: fm.schedule ? String(fm.schedule) : null,
      path,
    });
  }

  out.sort((a, b) => a.name.localeCompare(b.name));
  return out;
}
