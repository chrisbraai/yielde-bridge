import "server-only";
import { readdir, readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import { homedir } from "node:os";
import { upsertOperatorRun, listRecentOperatorRuns, type OperatorRun } from "./runtime";

// Each /operator deploy <agent> writes a JSONL log at
//   ~/.claude/operator/runs/<agent>/<run-id>.jsonl
// Two canonical events: `run.start` (top) and `run.end` (bottom). Other lines may carry tokens/cost.

export function operatorRunsRoot(): string {
  if (process.env.YIELDE_OPERATOR_RUNS) return process.env.YIELDE_OPERATOR_RUNS;
  return join(homedir(), ".claude", "operator", "runs");
}

type LogEvent = {
  event?: string;
  ts?: string;
  agent?: string;
  run_id?: string;
  model?: string;
  status?: string;
  exit_code?: number;
  cost_cents?: number;
  tokens_in?: number;
  tokens_out?: number;
  summary?: string;
};

async function parseRunFile(agent: string, file: string): Promise<{
  agent: string;
  run_id: string;
  started_at: string;
  finished_at: string | null;
  status: string | null;
  exit_code: number | null;
  cost_cents: number | null;
  tokens_in: number | null;
  tokens_out: number | null;
  summary: string | null;
} | null> {
  let raw: string;
  try {
    raw = await readFile(file, "utf8");
  } catch {
    return null;
  }
  const lines = raw.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length === 0) return null;

  const events: LogEvent[] = [];
  for (const line of lines) {
    try {
      events.push(JSON.parse(line) as LogEvent);
    } catch {
      // Tolerate trailing partial lines.
    }
  }
  if (events.length === 0) return null;

  const start = events.find((e) => e.event === "run.start") ?? events[0];
  const end = [...events].reverse().find((e) => e.event === "run.end");
  const runId = start?.run_id ?? file.split(/[\\/]/).pop()?.replace(/\.jsonl$/, "") ?? "unknown";

  // Aggregate token / cost fields across all events (last-writer-wins).
  let tokensIn: number | null = null;
  let tokensOut: number | null = null;
  let costCents: number | null = null;
  for (const e of events) {
    if (typeof e.tokens_in === "number") tokensIn = e.tokens_in;
    if (typeof e.tokens_out === "number") tokensOut = e.tokens_out;
    if (typeof e.cost_cents === "number") costCents = e.cost_cents;
  }

  return {
    agent,
    run_id: runId,
    started_at: start?.ts ?? new Date().toISOString(),
    finished_at: end?.ts ?? null,
    status: end?.status ?? (end ? null : "running"),
    exit_code: end?.exit_code ?? null,
    cost_cents: costCents,
    tokens_in: tokensIn,
    tokens_out: tokensOut,
    summary: end?.summary ?? null,
  };
}

export async function syncOperatorRuns(): Promise<{ scanned: number; upserted: number }> {
  const root = operatorRunsRoot();
  let agents: string[] = [];
  try {
    agents = await readdir(root);
  } catch {
    return { scanned: 0, upserted: 0 };
  }

  let scanned = 0;
  let upserted = 0;
  for (const agent of agents) {
    const agentDir = join(root, agent);
    let entries: string[] = [];
    try {
      const st = await stat(agentDir);
      if (!st.isDirectory()) continue;
      entries = await readdir(agentDir);
    } catch {
      continue;
    }
    for (const entry of entries) {
      if (!entry.endsWith(".jsonl")) continue;
      scanned++;
      const parsed = await parseRunFile(agent, join(agentDir, entry));
      if (!parsed) continue;
      upsertOperatorRun(parsed);
      upserted++;
    }
  }
  return { scanned, upserted };
}

export async function recentOperatorRuns(limit = 50): Promise<OperatorRun[]> {
  await syncOperatorRuns();
  return listRecentOperatorRuns(limit);
}
