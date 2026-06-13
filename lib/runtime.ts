import "server-only";
import Database from "better-sqlite3";
import { mkdirSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { homedir } from "node:os";

// Phase 3 invariant: Bridge writes runtime state here (NOT yielde-bridge-config/, which is git-tracked
// registry source-of-truth and stays read-only from the app). Runtime = local cache, audit, replay.

let _db: Database.Database | null = null;

export function runtimeDbPath(): string {
  if (process.env.YIELDE_BRIDGE_RUNTIME_DB) return process.env.YIELDE_BRIDGE_RUNTIME_DB;
  return join(homedir(), ".claude", "bridge", "runtime", "runtime.db");
}

function openDb(): Database.Database {
  const path = runtimeDbPath();
  const dir = dirname(path);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  const db = new Database(path);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  initSchema(db);
  return db;
}

export function db(): Database.Database {
  if (_db) return _db;
  _db = openDb();
  return _db;
}

function initSchema(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS webhook_deliveries (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      slug          TEXT NOT NULL,
      received_at   TEXT NOT NULL,
      source_ip     TEXT,
      payload_hash  TEXT NOT NULL,
      status        TEXT NOT NULL,
      http_code     INTEGER NOT NULL,
      reason        TEXT,
      body_blob     BLOB
    );
    CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_slug_received
      ON webhook_deliveries(slug, received_at DESC);
  `);

  // Phase 4: per-delivery dispatch tracking. Idempotent additive migration so existing rows survive.
  const cols = new Set(
    (db.pragma("table_info(webhook_deliveries)") as { name: string }[]).map((c) => c.name),
  );
  for (const [name, sql] of [
    ["dispatch_status", "ALTER TABLE webhook_deliveries ADD COLUMN dispatch_status TEXT"],
    ["dispatch_target", "ALTER TABLE webhook_deliveries ADD COLUMN dispatch_target TEXT"],
    ["dispatch_run_id", "ALTER TABLE webhook_deliveries ADD COLUMN dispatch_run_id TEXT"],
    ["dispatched_at", "ALTER TABLE webhook_deliveries ADD COLUMN dispatched_at TEXT"],
    ["dispatch_log", "ALTER TABLE webhook_deliveries ADD COLUMN dispatch_log TEXT"],
    ["redaction_applied", "ALTER TABLE webhook_deliveries ADD COLUMN redaction_applied INTEGER NOT NULL DEFAULT 0"],
  ] as const) {
    if (!cols.has(name)) db.exec(sql);
  }

  db.exec(`

    CREATE TABLE IF NOT EXISTS operator_runs (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      agent        TEXT NOT NULL,
      run_id       TEXT NOT NULL,
      started_at   TEXT NOT NULL,
      finished_at  TEXT,
      status       TEXT,
      exit_code    INTEGER,
      cost_cents   INTEGER,
      tokens_in    INTEGER,
      tokens_out   INTEGER,
      summary      TEXT,
      UNIQUE(agent, run_id)
    );
    CREATE INDEX IF NOT EXISTS idx_operator_runs_started
      ON operator_runs(started_at DESC);

    CREATE TABLE IF NOT EXISTS sessions (
      id             TEXT PRIMARY KEY,
      harness        TEXT,
      role           TEXT,
      started_at     TEXT,
      ended_at       TEXT,
      model          TEXT,
      tokens_in      INTEGER,
      tokens_out     INTEGER,
      cost_cents     INTEGER,
      intent         TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_sessions_started
      ON sessions(started_at DESC);
  `);
}

// ---------- Webhook deliveries ----------

export type DispatchStatus = "queued" | "succeeded" | "failed" | "skipped" | null;

export type WebhookDelivery = {
  id: number;
  slug: string;
  received_at: string;
  source_ip: string | null;
  payload_hash: string;
  status: "accepted" | "rejected" | "error";
  http_code: number;
  reason: string | null;
  dispatch_status: DispatchStatus;
  dispatch_target: string | null;
  dispatch_run_id: string | null;
  dispatched_at: string | null;
  dispatch_log: string | null;
  redaction_applied: number;
};

export type InsertWebhookDelivery = {
  slug: string;
  receivedAt: string;
  sourceIp: string | null;
  payloadHash: string;
  status: "accepted" | "rejected" | "error";
  httpCode: number;
  reason: string | null;
  body: Buffer | null;
  redactionApplied?: boolean;
};

export function insertWebhookDelivery(d: InsertWebhookDelivery): number {
  const stmt = db().prepare(
    `INSERT INTO webhook_deliveries
      (slug, received_at, source_ip, payload_hash, status, http_code, reason, body_blob, redaction_applied)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  const info = stmt.run(
    d.slug,
    d.receivedAt,
    d.sourceIp,
    d.payloadHash,
    d.status,
    d.httpCode,
    d.reason,
    d.body,
    d.redactionApplied ? 1 : 0,
  );
  pruneSlugRetention(d.slug);
  return Number(info.lastInsertRowid);
}

export type DispatchUpdate = {
  id: number;
  status: Exclude<DispatchStatus, null>;
  target: string;
  runId: string | null;
  log: string;
  dispatchedAt?: string;
};

export function updateDispatch(u: DispatchUpdate): void {
  db()
    .prepare(
      `UPDATE webhook_deliveries
       SET dispatch_status = ?,
           dispatch_target = ?,
           dispatch_run_id = ?,
           dispatched_at  = COALESCE(?, dispatched_at, datetime('now')),
           dispatch_log   = ?
       WHERE id = ?`,
    )
    .run(u.status, u.target, u.runId, u.dispatchedAt ?? null, u.log, u.id);
}

const DEFAULT_KEEP_PER_SLUG = 100;
let perSlugRetentionLimits: Map<string, number> = new Map();

export function setRetentionLimits(limits: Map<string, number>): void {
  perSlugRetentionLimits = limits;
}

function keepCountForSlug(slug: string): number {
  return perSlugRetentionLimits.get(slug) ?? DEFAULT_KEEP_PER_SLUG;
}

function pruneSlugRetention(slug: string): void {
  db()
    .prepare(
      `DELETE FROM webhook_deliveries
       WHERE id IN (
         SELECT id FROM webhook_deliveries
         WHERE slug = ?
         ORDER BY received_at DESC, id DESC
         LIMIT -1 OFFSET ?
       )`,
    )
    .run(slug, keepCountForSlug(slug));
}

const WEBHOOK_SELECT = `
  id, slug, received_at, source_ip, payload_hash, status, http_code, reason,
  dispatch_status, dispatch_target, dispatch_run_id, dispatched_at, dispatch_log,
  redaction_applied
`;

export function listRecentWebhookDeliveries(limit = 100): WebhookDelivery[] {
  return db()
    .prepare(
      `SELECT ${WEBHOOK_SELECT}
       FROM webhook_deliveries
       ORDER BY received_at DESC, id DESC
       LIMIT ?`,
    )
    .all(limit) as WebhookDelivery[];
}

export function listWebhookDeliveriesSince(
  sinceId: number,
  limit = 100,
): WebhookDelivery[] {
  return db()
    .prepare(
      `SELECT ${WEBHOOK_SELECT}
       FROM webhook_deliveries
       WHERE id > ?
       ORDER BY id ASC
       LIMIT ?`,
    )
    .all(sinceId, limit) as WebhookDelivery[];
}

export function maxWebhookDeliveryId(): number {
  const row = db().prepare(`SELECT MAX(id) AS m FROM webhook_deliveries`).get() as
    | { m: number | null }
    | undefined;
  return row?.m ?? 0;
}

// ---------- Operator runs (upsert from on-disk JSONL) ----------

export type OperatorRun = {
  id: number;
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
};

export type UpsertOperatorRun = Omit<OperatorRun, "id">;

export function upsertOperatorRun(r: UpsertOperatorRun): void {
  db()
    .prepare(
      `INSERT INTO operator_runs
        (agent, run_id, started_at, finished_at, status, exit_code, cost_cents, tokens_in, tokens_out, summary)
       VALUES (@agent, @run_id, @started_at, @finished_at, @status, @exit_code, @cost_cents, @tokens_in, @tokens_out, @summary)
       ON CONFLICT(agent, run_id) DO UPDATE SET
         finished_at = excluded.finished_at,
         status      = excluded.status,
         exit_code   = excluded.exit_code,
         cost_cents  = excluded.cost_cents,
         tokens_in   = excluded.tokens_in,
         tokens_out  = excluded.tokens_out,
         summary     = excluded.summary`,
    )
    .run(r);
}

export function listRecentOperatorRuns(limit = 50): OperatorRun[] {
  return db()
    .prepare(
      `SELECT id, agent, run_id, started_at, finished_at, status, exit_code, cost_cents, tokens_in, tokens_out, summary
       FROM operator_runs
       ORDER BY started_at DESC
       LIMIT ?`,
    )
    .all(limit) as OperatorRun[];
}

// ---------- Cost rollup ----------

export type DailyCostBucket = {
  day: string;
  session_cents: number;
  operator_cents: number;
};

export function listDailyCostBuckets(days = 14): DailyCostBucket[] {
  const startOffset = `-${days - 1} days`;
  return db()
    .prepare(
      `WITH RECURSIVE day_seq(d) AS (
         SELECT date('now')
         UNION ALL
         SELECT date(d, '-1 day') FROM day_seq WHERE d > date('now', ?)
       ),
       sess AS (
         -- Bucket by started_at, falling back to ended_at for close-only kernel
         -- rows (session.cost emissions from yielde-os-session-stop.ps1 that
         -- never had a matching session.started). Without COALESCE, those rows
         -- bucket under day=NULL and silently drop out of the rollup.
         SELECT substr(COALESCE(started_at, ended_at), 1, 10) AS day,
                SUM(cost_cents) AS cost_cents
         FROM sessions
         WHERE COALESCE(started_at, ended_at) IS NOT NULL
         GROUP BY day
       ),
       op AS (
         SELECT substr(started_at, 1, 10) AS day, SUM(cost_cents) AS cost_cents
         FROM operator_runs GROUP BY day
       )
       SELECT day_seq.d AS day,
              COALESCE(sess.cost_cents, 0) AS session_cents,
              COALESCE(op.cost_cents, 0)  AS operator_cents
       FROM day_seq
       LEFT JOIN sess ON sess.day = day_seq.d
       LEFT JOIN op   ON op.day   = day_seq.d
       ORDER BY day_seq.d ASC`,
    )
    .all(startOffset) as DailyCostBucket[];
}

// ---------- Sessions (kernel-derived) ----------

export type SessionRowDb = {
  id: string;
  harness: string | null;
  role: string | null;
  started_at: string | null;
  ended_at: string | null;
  model: string | null;
  tokens_in: number | null;
  tokens_out: number | null;
  cost_cents: number | null;
  intent: string | null;
};

export type UpsertSessionRow = SessionRowDb;

export function upsertSession(r: UpsertSessionRow): void {
  // SQLite UPSERT keeps non-null incoming values and preserves existing ones when new is null,
  // so a session.started write doesn't blow away the ended_at written by a later session.stopped.
  db()
    .prepare(
      `INSERT INTO sessions (id, harness, role, started_at, ended_at, model,
                             tokens_in, tokens_out, cost_cents, intent)
       VALUES (@id, @harness, @role, @started_at, @ended_at, @model,
               @tokens_in, @tokens_out, @cost_cents, @intent)
       ON CONFLICT(id) DO UPDATE SET
         harness    = COALESCE(excluded.harness,    sessions.harness),
         role       = COALESCE(excluded.role,       sessions.role),
         started_at = COALESCE(excluded.started_at, sessions.started_at),
         ended_at   = COALESCE(excluded.ended_at,   sessions.ended_at),
         model      = COALESCE(excluded.model,      sessions.model),
         tokens_in  = COALESCE(excluded.tokens_in,  sessions.tokens_in),
         tokens_out = COALESCE(excluded.tokens_out, sessions.tokens_out),
         cost_cents = COALESCE(excluded.cost_cents, sessions.cost_cents),
         intent     = COALESCE(excluded.intent,     sessions.intent)`,
    )
    .run(r);
}

export function runtimeStats(): { webhooks: number; operatorRuns: number; sessions: number } {
  const wh = db().prepare(`SELECT COUNT(*) AS n FROM webhook_deliveries`).get() as { n: number };
  const op = db().prepare(`SELECT COUNT(*) AS n FROM operator_runs`).get() as { n: number };
  const s = db().prepare(`SELECT COUNT(*) AS n FROM sessions`).get() as { n: number };
  return { webhooks: wh.n, operatorRuns: op.n, sessions: s.n };
}

// ---------- Read-only helpers for the cockpit (lib/cockpit) ----------
// Added for the mission-control snapshot. These are pure reads; they never mutate state and never
// touch the existing write/sync functions above. Date math uses SQLite's local-day functions so it
// matches the cost rollup's day buckets and the deploy-log's local-day semantics.

/**
 * Count sessions whose started_at (fallback ended_at, matching listDailyCostBuckets) falls within
 * the last 7 local days (today inclusive). Sessions with no usable timestamp are excluded.
 */
export function sessionsStartedSince(days = 7): number {
  const startOffset = `-${days - 1} days`;
  const row = db()
    .prepare(
      `SELECT COUNT(*) AS n
       FROM sessions
       WHERE COALESCE(started_at, ended_at) IS NOT NULL
         AND date(substr(COALESCE(started_at, ended_at), 1, 10)) >= date('now', ?)`,
    )
    .get(startOffset) as { n: number } | undefined;
  return row?.n ?? 0;
}

/**
 * Top models by session COUNT over the last `days` local days. Sessions without a model are
 * excluded (the kernel leaves model NULL until a session.cost event lands). Returns rows
 * descending by count; the caller converts counts to share percentages.
 */
export function modelMixSince(days = 7, limit = 6): { model: string; count: number }[] {
  const startOffset = `-${days - 1} days`;
  return db()
    .prepare(
      `SELECT model, COUNT(*) AS count
       FROM sessions
       WHERE model IS NOT NULL AND model <> ''
         AND COALESCE(started_at, ended_at) IS NOT NULL
         AND date(substr(COALESCE(started_at, ended_at), 1, 10)) >= date('now', ?)
       GROUP BY model
       ORDER BY count DESC, model ASC
       LIMIT ?`,
    )
    .all(startOffset, limit) as { model: string; count: number }[];
}

/**
 * Average cost_cents across sessions in the last `days` local days that actually reported a cost.
 * Returns null when no priced session exists in the window (cost telemetry is currently sparse —
 * surface the gap honestly rather than dividing by total session count and lying low).
 */
export function avgSessionCostCentsSince(days = 7): number | null {
  const startOffset = `-${days - 1} days`;
  const row = db()
    .prepare(
      `SELECT AVG(cost_cents) AS avg, COUNT(cost_cents) AS priced
       FROM sessions
       WHERE cost_cents IS NOT NULL
         AND COALESCE(started_at, ended_at) IS NOT NULL
         AND date(substr(COALESCE(started_at, ended_at), 1, 10)) >= date('now', ?)`,
    )
    .get(startOffset) as { avg: number | null; priced: number } | undefined;
  if (!row || row.priced === 0 || row.avg == null) return null;
  return Math.round(row.avg);
}

/**
 * Most-recently-started sessions that have a usable started_at, capped. Used for the cockpit's
 * recent-run feed (merged with operator runs by the caller).
 */
export function listRecentSessions(limit = 20): SessionRowDb[] {
  return db()
    .prepare(
      `SELECT id, harness, role, started_at, ended_at, model, tokens_in, tokens_out, cost_cents, intent
       FROM sessions
       WHERE started_at IS NOT NULL
       ORDER BY started_at DESC
       LIMIT ?`,
    )
    .all(limit) as SessionRowDb[];
}

/**
 * Operator-run success/failure counts over the last `days` local days, bucketed by started_at.
 * Only terminal statuses are counted; "running"/null are ignored.
 */
export function operatorRunOutcomesSince(days = 7): { succeeded: number; failed: number } {
  const startOffset = `-${days - 1} days`;
  const row = db()
    .prepare(
      `SELECT
         SUM(CASE WHEN status = 'succeeded' THEN 1 ELSE 0 END) AS succeeded,
         SUM(CASE WHEN status = 'failed'    THEN 1 ELSE 0 END) AS failed
       FROM operator_runs
       WHERE started_at IS NOT NULL
         AND date(substr(started_at, 1, 10)) >= date('now', ?)`,
    )
    .get(startOffset) as { succeeded: number | null; failed: number | null } | undefined;
  return { succeeded: row?.succeeded ?? 0, failed: row?.failed ?? 0 };
}
