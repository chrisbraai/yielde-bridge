import "server-only";
import { join } from "node:path";
import { homedir } from "node:os";
import { readJsonOrDefault } from "./json-io";

export type SessionRow = {
  id: string;
  role: string;
  intent: string;
  status: string;
  startedAt: string | null;
  lastHeartbeat: string | null;
  stoppedAt: string | null;
  stoppedReason: string | null;
  cwd: string | null;
  host: string | null;
  scope: string[];
};

type OsSessionsFile = {
  schema_version?: string;
  active_count?: number;
  sessions?: Record<
    string,
    {
      session_id?: string;
      role?: string;
      intent?: string;
      status?: string;
      started_at?: string;
      last_heartbeat?: string;
      stopped_at?: string;
      stopped_reason?: string;
      cwd?: string;
      host?: string;
      scope?: string[];
    }
  >;
};

export function sessionsPath(): string {
  if (process.env.YIELDE_OS_SESSIONS) return process.env.YIELDE_OS_SESSIONS;
  return join(homedir(), ".claude", "os", "sessions.json");
}

export async function listSessions(): Promise<SessionRow[]> {
  const data = await readJsonOrDefault<OsSessionsFile>(sessionsPath(), {});
  const entries = Object.entries(data.sessions ?? {});
  return entries
    .map(([id, v]) => ({
      id,
      role: v.role ?? "",
      intent: v.intent ?? "",
      status: v.status ?? "",
      startedAt: v.started_at ?? null,
      lastHeartbeat: v.last_heartbeat ?? null,
      stoppedAt: v.stopped_at ?? null,
      stoppedReason: v.stopped_reason ?? null,
      cwd: v.cwd ?? null,
      host: v.host ?? null,
      scope: v.scope ?? [],
    }))
    .sort((a, b) => {
      const aActive = a.status !== "stopped";
      const bActive = b.status !== "stopped";
      if (aActive !== bActive) return aActive ? -1 : 1;
      return (b.startedAt ?? "").localeCompare(a.startedAt ?? "");
    });
}

export async function activeSessionCount(): Promise<number> {
  const sessions = await listSessions();
  return sessions.filter((s) => s.status !== "stopped").length;
}
