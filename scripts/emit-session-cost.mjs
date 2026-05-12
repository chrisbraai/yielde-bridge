#!/usr/bin/env node
/**
 * emit-session-cost — Phase 5 kernel seam.
 *
 * Called by ~/.claude/hooks/yielde-os-session-stop.ps1 after the existing `session.stopped`
 * audit append. Reads the Claude Code transcript JSONL, aggregates token usage, calculates
 * cost in cents, appends a `session.cost` audit event to ~/.claude/os/audit.jsonl, AND
 * upserts the sessions row in ~/.claude/bridge/runtime/runtime.db.
 *
 *   node emit-session-cost.mjs --session-id <id> --transcript-path <path> [--ended-at <ISO>] [--role <name>]
 *
 * Exit 0 on success. Exit 0 (silently) when the transcript is missing — session.stopped
 * already covers the case and the hook is fail-soft. Exit 1 only on programmer errors
 * (missing required flags).
 *
 * Source-of-truth: yielde-bridge/scripts/emit-session-cost.mjs. A copy at
 * ~/.claude/bridge/cli/emit-session-cost.mjs is the kernel-callable path; keep them in
 * sync.
 */

import { readFileSync, existsSync, appendFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { homedir } from "node:os";
import Database from "better-sqlite3";

// ---------- Pricing (cents per 1M tokens) ----------
// Anthropic public pricing as of 2026. Cache_read = 10% of input, cache_create = 125% of input.
// Update this table when pricing changes.
const PRICING_CENTS_PER_MILLION = {
  "claude-opus-4-7":   { input: 1500, output: 7500, cacheRead: 150, cacheCreate: 1875 },
  "claude-opus-4-6":   { input: 1500, output: 7500, cacheRead: 150, cacheCreate: 1875 },
  "claude-sonnet-4-6": { input:  300, output: 1500, cacheRead:  30, cacheCreate:  375 },
  "claude-sonnet-4-5": { input:  300, output: 1500, cacheRead:  30, cacheCreate:  375 },
  "claude-haiku-4-5":  { input:  100, output:  500, cacheRead:  10, cacheCreate:  125 },
  "claude-haiku-4-4":  { input:  100, output:  500, cacheRead:  10, cacheCreate:  125 },
};

function priceFor(model) {
  if (!model) return null;
  // Match longest prefix so "claude-sonnet-4-6[1m]" still resolves.
  let best = null;
  let bestLen = 0;
  for (const key of Object.keys(PRICING_CENTS_PER_MILLION)) {
    if (model.startsWith(key) && key.length > bestLen) {
      best = key;
      bestLen = key.length;
    }
  }
  return best ? PRICING_CENTS_PER_MILLION[best] : null;
}

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith("--")) {
      const key = a.slice(2);
      const val = argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[++i] : true;
      out[key] = val;
    }
  }
  return out;
}

function aggregateUsage(transcriptPath) {
  if (!existsSync(transcriptPath)) return null;
  const raw = readFileSync(transcriptPath, "utf8");
  const lines = raw.split(/\r?\n/).filter(Boolean);
  let inTokens = 0;
  let outTokens = 0;
  let cacheRead = 0;
  let cacheCreate = 0;
  let model = null;
  for (const line of lines) {
    let obj;
    try {
      obj = JSON.parse(line);
    } catch {
      continue;
    }
    const u = obj?.message?.usage;
    if (u) {
      inTokens += u.input_tokens ?? 0;
      outTokens += u.output_tokens ?? 0;
      cacheRead += u.cache_read_input_tokens ?? 0;
      cacheCreate += u.cache_creation_input_tokens ?? 0;
    }
    if (obj?.message?.model) model = obj.message.model;
  }
  return { inTokens, outTokens, cacheRead, cacheCreate, model, lineCount: lines.length };
}

function computeCostCents(usage) {
  const p = priceFor(usage.model);
  if (!p) return null;
  const cents =
    (usage.inTokens   / 1_000_000) * p.input +
    (usage.outTokens  / 1_000_000) * p.output +
    (usage.cacheRead  / 1_000_000) * p.cacheRead +
    (usage.cacheCreate / 1_000_000) * p.cacheCreate;
  return Math.round(cents);
}

function appendAuditEvent(event) {
  const auditPath = join(homedir(), ".claude", "os", "audit.jsonl");
  const dir = dirname(auditPath);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  // PowerShell-style: append a single line, no BOM (Node default).
  appendFileSync(auditPath, JSON.stringify(event) + "\n", "utf8");
}

function upsertSession({ id, endedAt, role, model, tokensIn, tokensOut, costCents }) {
  const dbPath = process.env.YIELDE_BRIDGE_RUNTIME_DB
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
  db.prepare(
    `INSERT INTO sessions (id, harness, role, started_at, ended_at, model,
                           tokens_in, tokens_out, cost_cents, intent)
     VALUES (@id, null, @role, null, @endedAt, @model,
             @tokensIn, @tokensOut, @costCents, null)
     ON CONFLICT(id) DO UPDATE SET
       role       = COALESCE(excluded.role,       sessions.role),
       ended_at   = COALESCE(excluded.ended_at,   sessions.ended_at),
       model      = COALESCE(excluded.model,      sessions.model),
       tokens_in  = COALESCE(excluded.tokens_in,  sessions.tokens_in),
       tokens_out = COALESCE(excluded.tokens_out, sessions.tokens_out),
       cost_cents = COALESCE(excluded.cost_cents, sessions.cost_cents)`,
  ).run({ id, endedAt, role: role ?? null, model: model ?? null, tokensIn, tokensOut, costCents });
}

// ---------- main ----------

const flags = parseArgs(process.argv.slice(2));
const sessionId = typeof flags["session-id"] === "string" ? flags["session-id"] : null;
const transcriptPath = typeof flags["transcript-path"] === "string" ? flags["transcript-path"] : null;
if (!sessionId) {
  console.error("emit-session-cost: --session-id <id> is required");
  process.exit(1);
}
if (!transcriptPath) {
  console.error("emit-session-cost: --transcript-path <path> is required");
  process.exit(1);
}

const endedAt = typeof flags["ended-at"] === "string"
  ? flags["ended-at"]
  : new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
const role = typeof flags.role === "string" ? flags.role : null;

const usage = aggregateUsage(transcriptPath);
if (!usage) {
  // Transcript not found — fail-soft.
  console.log(JSON.stringify({ ok: true, skipped: "transcript-missing", session_id: sessionId, transcript_path: transcriptPath }));
  process.exit(0);
}

const costCents = computeCostCents(usage);

const event = {
  ts: endedAt,
  event: "session.cost",
  session_id: sessionId,
  model: usage.model,
  tokens_in: usage.inTokens,
  tokens_out: usage.outTokens,
  cache_read_tokens: usage.cacheRead,
  cache_creation_tokens: usage.cacheCreate,
  cost_cents: costCents,
  transcript_lines: usage.lineCount,
};

try {
  appendAuditEvent(event);
} catch (err) {
  // Audit append failure is non-fatal — DB upsert still happens.
  console.error(`emit-session-cost: audit append failed: ${err.message}`);
}

try {
  upsertSession({
    id: sessionId,
    endedAt,
    role,
    model: usage.model,
    tokensIn: usage.inTokens,
    tokensOut: usage.outTokens,
    costCents,
  });
} catch (err) {
  console.error(`emit-session-cost: runtime.db upsert failed: ${err.message}`);
  // Still exit 0 — the audit event is the canonical record; bridge re-derives from audit.jsonl on next sync.
}

console.log(JSON.stringify({ ok: true, ...event }));
process.exit(0);
