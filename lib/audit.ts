import "server-only";
import { readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import { homedir } from "node:os";

// Kernel writes append-only JSONL to ~/.claude/os/audit.jsonl. One JSON object per line.
// Shape varies by event but ts + event are stable.

export type AuditEvent = {
  ts: string;
  event: string;
  // Common optional fields (depends on event):
  session_id?: string;
  actor?: string;
  phase?: number | string;
  detail?: string;
  role?: string;
  intent?: string;
  status?: string;
  source?: string;
  scope?: string[];
  cwd?: string;
  host?: string;
  capability?: string;
  tool?: string;
  pattern?: string;
  command?: string;
  agent?: string;
  run_id?: string;
  reason?: string;
  // Anything else the kernel decides to write — preserved on the record.
  [k: string]: unknown;
};

export function auditLogPath(): string {
  if (process.env.YIELDE_OS_AUDIT_LOG) return process.env.YIELDE_OS_AUDIT_LOG;
  return join(homedir(), ".claude", "os", "audit.jsonl");
}

async function readAllLines(path: string): Promise<string[]> {
  try {
    const st = await stat(path);
    if (!st.isFile()) return [];
  } catch {
    return [];
  }
  const raw = await readFile(path, "utf8");
  return raw.split(/\r?\n/).filter((l) => l.trim().length > 0);
}

function parseLine(line: string): AuditEvent | null {
  try {
    const parsed = JSON.parse(line) as Partial<AuditEvent>;
    if (typeof parsed?.ts !== "string" || typeof parsed?.event !== "string") return null;
    return parsed as AuditEvent;
  } catch {
    return null;
  }
}

export type AuditQuery = {
  /** free-text substring match against the raw JSON line, case-insensitive */
  q?: string;
  /** restrict to events whose `event` field matches (exact) */
  event?: string;
  /** restrict to a single session id */
  sessionId?: string;
  /** max rows returned (newest first) */
  limit?: number;
};

export async function listAuditEvents(query: AuditQuery = {}): Promise<AuditEvent[]> {
  const lines = await readAllLines(auditLogPath());
  const limit = query.limit ?? 200;
  const qLower = query.q?.toLowerCase();

  // Walk newest-to-oldest so we can stop after `limit` matches.
  const out: AuditEvent[] = [];
  for (let i = lines.length - 1; i >= 0 && out.length < limit; i--) {
    const line = lines[i]!;
    if (qLower && !line.toLowerCase().includes(qLower)) continue;
    const ev = parseLine(line);
    if (!ev) continue;
    if (query.event && ev.event !== query.event) continue;
    if (query.sessionId && ev.session_id !== query.sessionId) continue;
    out.push(ev);
  }
  return out;
}

export async function auditEventCounts(): Promise<{ event: string; count: number }[]> {
  const lines = await readAllLines(auditLogPath());
  const counts = new Map<string, number>();
  for (const line of lines) {
    const ev = parseLine(line);
    if (!ev) continue;
    counts.set(ev.event, (counts.get(ev.event) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([event, count]) => ({ event, count }))
    .sort((a, b) => b.count - a.count);
}

export async function auditTotalLines(): Promise<number> {
  return (await readAllLines(auditLogPath())).length;
}
