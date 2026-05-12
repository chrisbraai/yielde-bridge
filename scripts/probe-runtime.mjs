import Database from "better-sqlite3";
import { homedir } from "node:os";
import { join } from "node:path";

const path = process.env.YIELDE_BRIDGE_RUNTIME_DB ?? join(homedir(), ".claude", "bridge", "runtime", "runtime.db");
const db = new Database(path, { readonly: true });

const tables = db
  .prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
  .all()
  .map((r) => r.name);
console.log("path:", path);
console.log("tables:", tables);
console.log("webhook_deliveries:", db.prepare("SELECT COUNT(*) AS n FROM webhook_deliveries").get().n);
console.log("operator_runs:", db.prepare("SELECT COUNT(*) AS n FROM operator_runs").get().n);
console.log("sessions:", db.prepare("SELECT COUNT(*) AS n FROM sessions").get().n);

const recentRuns = db
  .prepare("SELECT agent, run_id, status FROM operator_runs ORDER BY started_at DESC LIMIT 5")
  .all();
console.log("recent operator runs:", recentRuns);

const recentWh = db
  .prepare(
    `SELECT slug, status, http_code, dispatch_status, dispatch_target, redaction_applied, reason
     FROM webhook_deliveries
     ORDER BY id DESC
     LIMIT 5`,
  )
  .all();
console.log("recent webhook deliveries:", recentWh);

const recentSess = db
  .prepare(
    `SELECT id, role, started_at, ended_at, cost_cents
     FROM sessions
     ORDER BY started_at DESC NULLS LAST
     LIMIT 5`,
  )
  .all();
console.log("recent sessions:", recentSess);
