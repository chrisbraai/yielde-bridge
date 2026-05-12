#!/usr/bin/env node
/**
 * Phase 6 end-to-end smoke. Runs entirely in a temp dir so the live runtime DB and live
 * /operator agents are not touched. Verifies that:
 *
 *   1. A queued webhook delivery with target = a fresh `runtime: cron` agent flips to
 *      `dispatch_status = succeeded` after running the sweeper in `operator-deploy` mode.
 *   2. The sweeper invokes `runtimes/cron.ps1` for the cron target (no LLM cost).
 *   3. The agent's run JSONL gains `dispatch.intent` + `dispatch.invoked` + `operator.run.end`
 *      events with the captured command exit code.
 *
 * Exit 0 on pass, 1 on fail.
 */

import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync, cpSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";
import Database from "better-sqlite3";

const TMP = join(tmpdir(), `phase6-smoke-${Date.now()}`);
const DB_PATH = join(TMP, "runtime.db");
const DISPATCH_ROOT = join(TMP, "dispatches");
const OPERATOR_ROOT = join(TMP, "operator");

mkdirSync(join(OPERATOR_ROOT, "agents"), { recursive: true });
mkdirSync(join(OPERATOR_ROOT, "runs"), { recursive: true });
mkdirSync(join(OPERATOR_ROOT, "runtimes"), { recursive: true });
mkdirSync(join(OPERATOR_ROOT, "lib"), { recursive: true });
mkdirSync(join(DISPATCH_ROOT, "smoke-slug"), { recursive: true });

// Mirror the runtime adapter + lib into the temp operator dir (so cron.ps1's hard-coded
// $OperatorDir at C:\Users\chris\.claude\operator is bypassable via PSCommandPath relativity).
// We deliberately let cron.ps1 use the real ~/.claude/operator paths for run log + audit so the
// smoke proves the integration path. The temp operator only provides agents/<name>.md.
cpSync(
  "C:\\Users\\chris\\.claude\\operator\\runtimes\\cron.ps1",
  join(OPERATOR_ROOT, "runtimes", "cron.ps1"),
);
cpSync(
  "C:\\Users\\chris\\.claude\\operator\\lib\\operator.ps1",
  join(OPERATOR_ROOT, "lib", "operator.ps1"),
);

// Smoke agent: a cron-runtime that prints a known marker line and exits 0.
const agentName = `phase6-smoke-${Date.now().toString(36)}`;
const manifest = `---
name: ${agentName}
description: Phase 6 smoke target — prints a known marker and exits 0
runtime: cron
model: haiku
tools: [Bash]
mcps: []
webhooks: []
schedule: ""
command: "cmd /c echo PHASE6_MARKER_OK"
capability_requirements: []
inputs: []
context_bundle:
  always: []
  conditional: []
version: 1
created: 2026-05-12
last_reviewed: 2026-05-12
---

# ${agentName}

Phase 6 smoke target.
`;
writeFileSync(join(OPERATOR_ROOT, "agents", `${agentName}.md`), manifest, "utf8");

// Seed the DB with a webhook_deliveries row in `queued` state.
const db = new Database(DB_PATH);
db.pragma("journal_mode = WAL");
db.exec(`
  CREATE TABLE IF NOT EXISTS webhook_deliveries (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    slug TEXT NOT NULL,
    received_at TEXT NOT NULL,
    source_ip TEXT,
    payload_hash TEXT NOT NULL,
    status TEXT NOT NULL,
    http_code INTEGER NOT NULL,
    reason TEXT,
    body_blob BLOB,
    dispatch_status TEXT,
    dispatch_target TEXT,
    dispatch_run_id TEXT,
    dispatched_at TEXT,
    dispatch_log TEXT,
    redaction_applied INTEGER NOT NULL DEFAULT 0
  );
`);
const receivedAt = new Date().toISOString();
const runId = "phase6-smoke-" + Math.random().toString(36).slice(2, 10);
const info = db.prepare(
  `INSERT INTO webhook_deliveries
    (slug, received_at, payload_hash, status, http_code, dispatch_status, dispatch_target, dispatch_run_id)
   VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
).run("smoke-slug", receivedAt, "deadbeef", "accepted", 202, "queued", agentName, runId);
const deliveryId = Number(info.lastInsertRowid);
db.close();

// Queue file.
const queueFile = join(DISPATCH_ROOT, "smoke-slug", `${runId}.json`);
writeFileSync(queueFile, JSON.stringify({
  schema_version: "1.0",
  enqueued_at: new Date().toISOString(),
  run_id: runId,
  delivery_id: deliveryId,
  slug: "smoke-slug",
  target_skill: agentName,
  payload_hash: "deadbeef",
  received_at: receivedAt,
  body_path: null,
  body_bytes: 0,
}, null, 2), "utf8");

// Invoke the sweeper.
const env = {
  ...process.env,
  YIELDE_BRIDGE_RUNTIME_DB: DB_PATH,
  YIELDE_BRIDGE_DISPATCH_QUEUE: DISPATCH_ROOT,
  YIELDE_OPERATOR_DIR: OPERATOR_ROOT,
};
const res = spawnSync(
  process.execPath,
  [join(dirname(new URL(import.meta.url).pathname.replace(/^\//, "")), "sweep-dispatches.mjs"), "--mode", "operator-deploy", "--verbose"],
  { env, encoding: "utf8", timeout: 60_000 },
);

const stdout = res.stdout ?? "";
const stderr = res.stderr ?? "";
console.log("--- sweeper stdout ---\n" + stdout);
if (stderr) console.log("--- sweeper stderr ---\n" + stderr);

if (res.status !== 0) {
  console.error(`FAIL: sweeper exit ${res.status}`);
  process.exit(1);
}

// Re-open DB read-only and verify.
const db2 = new Database(DB_PATH, { readonly: true });
const row = db2.prepare("SELECT id, dispatch_status, dispatch_target, dispatch_log FROM webhook_deliveries WHERE id = ?").get(deliveryId);
db2.close();
console.log("--- delivery row after sweep ---");
console.log(JSON.stringify(row, null, 2));

if (!row) { console.error("FAIL: row missing"); process.exit(1); }
if (row.dispatch_status !== "succeeded") {
  console.error(`FAIL: dispatch_status expected 'succeeded', got '${row.dispatch_status}'`);
  process.exit(1);
}

// Run log assertions — cron.ps1 (with $env:YIELDE_OPERATOR_DIR override) and the sweeper
// both write into <OPERATOR_ROOT>/runs/<agent>/<run-id>.jsonl, so a single file accumulates
// all events.
const runFile = join(OPERATOR_ROOT, "runs", agentName, `${runId}.jsonl`);
if (!existsSync(runFile)) {
  console.error(`FAIL: run log missing at ${runFile}`);
  process.exit(1);
}
const runLines = readFileSync(runFile, "utf8").split(/\r?\n/).filter(Boolean).map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
const events = runLines.map((e) => e.event);
console.log("--- run log events ---");
console.log(events.join(" -> "));
const required = ["dispatch.intent", "run.start", "cron.invoking", "run.end", "dispatch.invoked", "operator.run.end"];
const missing = required.filter((e) => !events.includes(e));
if (missing.length) {
  console.error(`FAIL: run log missing events: ${missing.join(", ")}`);
  process.exit(1);
}

// run.end carries the agent command's captured stdout. dispatch.invoked captures cron.ps1's
// own JSON envelope (`{"ok":true,...}`), not the underlying command output.
const runEnd = runLines.find((e) => e.event === "run.end");
if (!runEnd || !(runEnd.stdout_tail || "").includes("PHASE6_MARKER_OK")) {
  console.error("FAIL: run.end event missing PHASE6_MARKER_OK in stdout_tail");
  console.error("run.end stdout_tail was: " + (runEnd?.stdout_tail || "<none>"));
  process.exit(1);
}
const invoked = runLines.find((e) => e.event === "dispatch.invoked");
if (!invoked || invoked.ok !== true || invoked.exit_code !== 0) {
  console.error("FAIL: dispatch.invoked event missing or non-zero exit");
  process.exit(1);
}

// Cleanup — temp dir, no real /operator state was touched.
try { rmSync(TMP, { recursive: true, force: true }); } catch {}

console.log("\n=== Phase 6 smoke PASS ===");
console.log(`delivery_id=${deliveryId} dispatch_status=${row.dispatch_status}`);
console.log(`events seen: ${events.join(" -> ")}`);
process.exit(0);
