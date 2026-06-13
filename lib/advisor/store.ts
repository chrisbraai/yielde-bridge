import "server-only";
import type { GatedSeverity } from "@/lib/cockpit/types";

// In-memory action store. The advisor (which can only READ) proposes side-effect commands as fenced
// `yielde-action` blocks; the route parses them, mints a short id, and stashs {id -> command} HERE.
// The /confirm route can then execute ONLY a command it can look up by id — Chris's click is the gate.
//
// This is intentionally a module-level singleton: it persists across requests within the single
// Next.js dev/server process, which is exactly what a local single-user tool needs. The command
// string is NEVER sent to the client as something runnable; the client only ever sends back an id.
//
// Entries are capped and TTL'd so a long-lived process can't accumulate stale proposals unbounded.

export type StoredAction = {
  id: string;
  command: string;
  danger: GatedSeverity;
  explanation: string;
  createdAt: number;
  // Lifecycle: 'pending' until Chris approves/rejects, then terminal. A consumed id cannot re-run.
  status: "pending" | "approved" | "rejected" | "consumed";
};

const TTL_MS = 60 * 60 * 1000; // 1h — a proposal Chris hasn't acted on in an hour is stale.
const MAX_ENTRIES = 200;

// globalThis pin so Next.js module re-evaluation (HMR in dev) doesn't silently fork the Map and
// lose in-flight proposals between the advisor route and the confirm route.
const g = globalThis as unknown as { __yieldeAdvisorActions?: Map<string, StoredAction> };
const store: Map<string, StoredAction> = (g.__yieldeAdvisorActions ??= new Map());

function prune(now: number): void {
  for (const [id, a] of store) {
    if (now - a.createdAt > TTL_MS) store.delete(id);
  }
  // Hard cap: drop oldest beyond MAX_ENTRIES (Map preserves insertion order).
  while (store.size > MAX_ENTRIES) {
    const oldest = store.keys().next().value;
    if (oldest === undefined) break;
    store.delete(oldest);
  }
}

// Short, URL-safe, collision-resistant enough for a single-user local tool.
function mintId(): string {
  return `act_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export function putAction(input: {
  command: string;
  danger: GatedSeverity;
  explanation: string;
}): StoredAction {
  const now = Date.now();
  prune(now);
  const action: StoredAction = {
    id: mintId(),
    command: input.command,
    danger: input.danger,
    explanation: input.explanation,
    createdAt: now,
    status: "pending",
  };
  store.set(action.id, action);
  return action;
}

export function getAction(id: string): StoredAction | undefined {
  return store.get(id);
}

// Atomically claim a pending action for execution. Returns the action only if it exists and is
// still pending; flips it to 'approved' so a double-click can't run the same command twice.
export function claimForRun(id: string): StoredAction | undefined {
  const a = store.get(id);
  if (!a || a.status !== "pending") return undefined;
  a.status = "approved";
  return a;
}

export function markConsumed(id: string): void {
  const a = store.get(id);
  if (a) a.status = "consumed";
}

export function rejectAction(id: string): boolean {
  const a = store.get(id);
  if (!a || a.status !== "pending") return false;
  a.status = "rejected";
  return true;
}
