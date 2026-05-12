import "server-only";
import { listAuditEvents } from "./audit";
import { upsertSession } from "./runtime";

// Yielde OS kernel writes session lifecycle events to ~/.claude/os/audit.jsonl:
//   - session.started  (id, role, cwd, scope, source, host)
//   - intent.set       (id, intent)
//   - session.stopped  (id, role, was_kernel)
// Token/cost telemetry is NOT yet recorded by the kernel — those columns stay NULL until the
// kernel writes session.cost events. recordSessionClose() is the receiver for that path so
// the kernel doesn't have to know SQLite.

type AuditRecord = {
  ts: string;
  event: string;
  session_id?: string;
  role?: string;
  intent?: string;
  model?: string;
  tokens_in?: number;
  tokens_out?: number;
  cost_cents?: number;
  harness?: string;
};

export async function syncSessionsFromAudit(): Promise<{ upserted: number }> {
  // Scan a generous window — audit.jsonl is small and reads are <50ms.
  const events = (await listAuditEvents({ limit: 5000 })) as unknown as AuditRecord[];
  let upserted = 0;
  for (const ev of events) {
    if (!ev.session_id) continue;

    if (ev.event === "session.started") {
      upsertSession({
        id: ev.session_id,
        harness: ev.harness ?? null,
        role: ev.role ?? null,
        started_at: ev.ts,
        ended_at: null,
        model: ev.model ?? null,
        tokens_in: null,
        tokens_out: null,
        cost_cents: null,
        intent: null,
      });
      upserted++;
    } else if (ev.event === "intent.set" && typeof ev.intent === "string") {
      upsertSession({
        id: ev.session_id,
        harness: null,
        role: null,
        started_at: null,
        ended_at: null,
        model: null,
        tokens_in: null,
        tokens_out: null,
        cost_cents: null,
        intent: ev.intent,
      });
      upserted++;
    } else if (ev.event === "session.stopped") {
      upsertSession({
        id: ev.session_id,
        harness: null,
        role: ev.role ?? null,
        started_at: null,
        ended_at: ev.ts,
        model: null,
        tokens_in: null,
        tokens_out: null,
        cost_cents: null,
        intent: null,
      });
      upserted++;
    } else if (ev.event === "session.cost") {
      // Future kernel event carrying token/cost telemetry.
      upsertSession({
        id: ev.session_id,
        harness: null,
        role: null,
        started_at: null,
        ended_at: null,
        model: ev.model ?? null,
        tokens_in: typeof ev.tokens_in === "number" ? ev.tokens_in : null,
        tokens_out: typeof ev.tokens_out === "number" ? ev.tokens_out : null,
        cost_cents: typeof ev.cost_cents === "number" ? ev.cost_cents : null,
        intent: null,
      });
      upserted++;
    }
  }
  return { upserted };
}
