#!/usr/bin/env node
/**
 * Kernel seam: PowerShell calls this on session close to write tokens/cost into runtime.db.
 *
 *   node record-session-close.mjs --id <session_id> \
 *                                 [--ended-at <ISO>] [--model <name>] \
 *                                 [--tokens-in N] [--tokens-out N] \
 *                                 [--cost-cents N] [--role <name>] \
 *                                 [--intent "..."] [--harness <name>]
 *
 * The corresponding `session.cost` audit event should still be appended by the kernel — this
 * script only mirrors that into runtime.db so the cost dashboards have local data.
 */

import Database from "better-sqlite3";
import { mkdirSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { homedir } from "node:os";

function parse(argv) {
  const flags = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith("--")) {
      const key = a.slice(2);
      const val = argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[++i] : true;
      flags[key] = val;
    }
  }
  return flags;
}

function int(v) {
  if (v == null || v === true) return null;
  const n = parseInt(String(v), 10);
  return Number.isFinite(n) ? n : null;
}

function str(v) {
  if (v == null || v === true) return null;
  const s = String(v);
  return s.length === 0 ? null : s;
}

const flags = parse(process.argv.slice(2));
const id = str(flags.id);
if (!id) {
  console.error("record-session-close: --id <session_id> is required");
  process.exit(1);
}

const dbPath =
  process.env.YIELDE_BRIDGE_RUNTIME_DB
  ?? join(homedir(), ".claude", "bridge", "runtime", "runtime.db");

if (!existsSync(dirname(dbPath))) mkdirSync(dirname(dbPath), { recursive: true });

const db = new Database(dbPath);
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");
db.exec(`
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
`);

const row = {
  id,
  harness: str(flags.harness),
  role: str(flags.role),
  started_at: null,
  ended_at: str(flags["ended-at"]) ?? new Date().toISOString(),
  model: str(flags.model),
  tokens_in: int(flags["tokens-in"]),
  tokens_out: int(flags["tokens-out"]),
  cost_cents: int(flags["cost-cents"]),
  intent: str(flags.intent),
};

db.prepare(
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
).run(row);

console.log(JSON.stringify({ ok: true, id, dbPath, applied: row }));
