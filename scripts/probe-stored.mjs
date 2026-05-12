#!/usr/bin/env node
// Inspect the most recently stored webhook_deliveries row — used by Phase 4 redaction/dispatch smoke.
import Database from "better-sqlite3";
import { join } from "node:path";
import { homedir } from "node:os";

const path = process.env.YIELDE_BRIDGE_RUNTIME_DB
  ?? join(homedir(), ".claude", "bridge", "runtime", "runtime.db");

const db = new Database(path, { readonly: true });
const row = db.prepare(`
  SELECT id, slug, status, dispatch_status, dispatch_target, dispatch_run_id, dispatch_log,
         redaction_applied, body_blob, reason
  FROM webhook_deliveries ORDER BY id DESC LIMIT 1
`).get();

if (!row) {
  console.log("no rows in webhook_deliveries");
  process.exit(0);
}

console.log("id:", row.id, "slug:", row.slug, "status:", row.status);
console.log("dispatch:", row.dispatch_status, "->", row.dispatch_target);
console.log("dispatch_run_id:", row.dispatch_run_id);
console.log("dispatch_log:", row.dispatch_log);
console.log("redaction_applied:", row.redaction_applied);
console.log("reason:", row.reason);

const body = row.body_blob ? row.body_blob.toString("utf8") : null;
console.log("body:", body);
