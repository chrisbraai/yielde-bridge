#!/usr/bin/env node
/**
 * sweep-dispatches — Phase 5 queue worker.
 *
 * Walks ~/.claude/bridge/dispatches/<slug>/*.json, attempts the dispatch for each one, and
 * flips webhook_deliveries.dispatch_status in runtime.db (queued → succeeded | failed).
 * Processed queue files move to ~/.claude/bridge/dispatches/<slug>/_processed/<status>/<file>.
 *
 *   node sweep-dispatches.mjs [--mode dry-run|operator-deploy|github-issue] [--limit N] [--verbose]
 *
 * Modes:
 *   dry-run         — mark each queued delivery `succeeded` with a note (default; used by the
 *                     verification gate so we don't burn LLM cost in CI).
 *   operator-deploy — for each delivery whose target matches an entry under
 *                     ~/.claude/operator/<target>/, append a run-intent line to
 *                     ~/.claude/operator/runs/<target>/<run-id>.jsonl and mark succeeded.
 *                     If the target dir is missing, fall through to github-issue.
 *   github-issue    — open a GitHub issue against Yielde-dev/brain with the dispatch
 *                     payload + label `operator-request`. Tier-2 fallback for Devon/Lyell.
 *
 * Hard rules:
 *   - Never mutates yielde-bridge-config/.
 *   - Idempotent across restarts: only files still in the slug dir are processed; moved files
 *     never re-enter the queue.
 *   - Strips a leading UTF-8 BOM defensively (Node-written files don't carry one, but the
 *     dispatch dir is user-overridable via env, so be defensive).
 *   - Filters the Windows libuv UV_HANDLE_CLOSING assertion from any spawned process stderr
 *     so it never surfaces.
 */

import Database from "better-sqlite3";
import { readdir, mkdir, rename, appendFile } from "node:fs/promises";
import { existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { homedir } from "node:os";
import { spawnSync } from "node:child_process";
import {
  stripLibuvNoise,
  readManifestRuntime as readManifestRuntimeShared,
  readJsonStrict,
} from "../lib/io-utils.mjs";

// ---------- arg parsing ----------

function parseArgs(argv) {
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

const flags = parseArgs(process.argv.slice(2));
const MODE = String(flags.mode ?? process.env.YIELDE_BRIDGE_DISPATCH_MODE ?? "dry-run");
const LIMIT = Number(flags.limit ?? 0) || Infinity;
const VERBOSE = Boolean(flags.verbose);

const VALID_MODES = new Set(["dry-run", "operator-deploy", "github-issue"]);
if (!VALID_MODES.has(MODE)) {
  console.error(`sweep-dispatches: unknown --mode ${MODE} (expected ${[...VALID_MODES].join("|")})`);
  process.exit(2);
}

// ---------- paths ----------

const DISPATCH_ROOT =
  process.env.YIELDE_BRIDGE_DISPATCH_QUEUE
  ?? join(homedir(), ".claude", "bridge", "dispatches");

const RUNTIME_DB =
  process.env.YIELDE_BRIDGE_RUNTIME_DB
  ?? join(homedir(), ".claude", "bridge", "runtime", "runtime.db");

const OPERATOR_ROOT =
  process.env.YIELDE_OPERATOR_DIR
  ?? join(homedir(), ".claude", "operator");

// ---------- helpers ----------
// `stripBom`, `stripLibuvNoise`, `readManifestRuntime`, `readJsonStrict` are
// imported from ../lib/io-utils.mjs (canonical, Phase 7 consolidation).

function log(...parts) {
  if (VERBOSE) console.log("[sweep]", ...parts);
}

// ---------- DB ----------

if (!existsSync(dirname(RUNTIME_DB))) mkdirSync(dirname(RUNTIME_DB), { recursive: true });
const db = new Database(RUNTIME_DB);
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

const updateStmt = db.prepare(
  `UPDATE webhook_deliveries
     SET dispatch_status = @status,
         dispatch_target = @target,
         dispatch_run_id = @runId,
         dispatched_at   = COALESCE(@dispatchedAt, dispatched_at, datetime('now')),
         dispatch_log    = @log
   WHERE id = @id`,
);

function updateDispatch({ id, status, target, runId, log: logText, dispatchedAt }) {
  updateStmt.run({
    id,
    status,
    target,
    runId,
    dispatchedAt: dispatchedAt ?? null,
    log: logText,
  });
}

// ---------- dispatch handlers (per mode) ----------

async function handleDryRun(req) {
  return {
    status: "succeeded",
    log: `dry-run: would invoke ${req.target_skill} (delivery ${req.delivery_id}, payload_hash ${req.payload_hash.slice(0, 8)})`,
  };
}

/**
 * Phase 6b: real execution. After recording dispatch intent, attempt to actually invoke
 * the target. Strategy by runtime:
 *   - cron / mcp-tool        → direct adapter spawn (no LLM cost)
 *   - claude-subagent / n8n  → spawn `claude -p "/operator deploy <target>"` IFF the
 *                              YIELDE_BRIDGE_DISPATCH_INVOKE env gate is set
 *                              (default: deferred to interactive operator)
 * In all cases the run JSONL gains `dispatch.intent` + `dispatch.invoked` + `operator.run.end`
 * events (or `dispatch.deferred` if gated off) and the sweeper outcome reflects the real
 * exit status.
 */
function invokeRuntimeAdapter(runtime, target, runId, inputsJson, timeoutMs) {
  // runtime ∈ { 'cron', 'mcp-tool' } → invoke runtimes/<runtime>.ps1
  const adapter = join(OPERATOR_ROOT, "runtimes", `${runtime}.ps1`);
  if (!existsSync(adapter)) {
    return { ok: false, exit: -1, stdout: "", stderr: `runtime adapter missing: ${adapter}`, structured: null };
  }
  const args = [
    "-NoProfile", "-ExecutionPolicy", "Bypass", "-File", adapter,
    "-Action", "run", "-Name", target, "-RunId", runId,
  ];
  if (inputsJson) { args.push("-InputsJson", inputsJson); }
  const res = spawnSync("powershell.exe", args, { encoding: "utf8", timeout: timeoutMs, windowsHide: true });
  let structured = null;
  if (res.stdout) {
    const trimmed = res.stdout.trim();
    if (trimmed.startsWith("{")) {
      try { structured = JSON.parse(trimmed); } catch { /* leave null */ }
    }
  }
  // cron.ps1 is fail-soft (always exits 0) and surfaces real failures via
  // structured.ok === false. Honour that so we don't silently report success
  // when the adapter reported a missing manifest or other error.
  const adapterReportedFailure = structured && typeof structured === "object" && structured.ok === false;
  const exit = res.status ?? -1;
  return {
    ok: exit === 0 && !adapterReportedFailure,
    exit,
    stdout: res.stdout ?? "",
    stderr: stripLibuvNoise(res.stderr ?? ""),
    structured,
  };
}

function invokeClaudeP(target, runId, inputs, timeoutMs) {
  // Build "/operator deploy <target> --key=value ..."
  const inputPairs = inputs && typeof inputs === "object"
    ? Object.entries(inputs).map(([k, v]) => `--${k}=${v}`)
    : [];
  const slash = `/operator deploy ${target}` + (inputPairs.length ? ` ${inputPairs.join(" ")}` : "");
  const res = spawnSync("claude", ["-p", slash], { encoding: "utf8", timeout: timeoutMs, windowsHide: true });
  return {
    ok: res.status === 0,
    exit: res.status ?? -1,
    stdout: res.stdout ?? "",
    stderr: stripLibuvNoise(res.stderr ?? ""),
    structured: null,
  };
}

async function handleOperatorDeploy(req) {
  const agentDir = join(OPERATOR_ROOT, "agents");
  const manifest = join(agentDir, `${req.target_skill}.md`);
  const registryPath = join(OPERATOR_ROOT, "registry.json");

  if (!existsSync(OPERATOR_ROOT)) {
    log(`OPERATOR_ROOT missing (${OPERATOR_ROOT}) — falling through to github-issue`);
    return handleGithubIssue(req);
  }

  if (!existsSync(manifest) && !existsSync(registryPath)) {
    return {
      status: "failed",
      log: `operator agent not found: ${req.target_skill} (no ${manifest}; no ${registryPath})`,
    };
  }

  // Record dispatch intent as a JSONL line in the agent's runs/ dir.
  const runsDir = join(OPERATOR_ROOT, "runs", req.target_skill);
  if (!existsSync(runsDir)) await mkdir(runsDir, { recursive: true });
  const runFile = join(runsDir, `${req.run_id}.jsonl`);
  const intentEvent = {
    ts: new Date().toISOString(),
    event: "dispatch.intent",
    source: "yielde-bridge.webhook",
    delivery_id: req.delivery_id,
    slug: req.slug,
    run_id: req.run_id,
    payload_hash: req.payload_hash,
  };
  // Append intent (atomic-ish, JSONL accumulates).
  await appendFile(runFile, JSON.stringify(intentEvent) + "\n", "utf8");

  const fm = readManifestRuntimeShared(OPERATOR_ROOT, req.target_skill);
  const runtime = fm?.runtime ?? "unknown";
  const timeoutMs = Math.max(60_000, Number(process.env.YIELDE_BRIDGE_DISPATCH_TIMEOUT_SEC || 300) * 1000);
  const inputsObj = (req.inputs && typeof req.inputs === "object") ? req.inputs : {};
  const inputsJson = JSON.stringify(inputsObj);

  const invokeAllowedForLlm = process.env.YIELDE_BRIDGE_DISPATCH_INVOKE === "1";
  const maxCostCents = Number(process.env.YIELDE_BRIDGE_DISPATCH_MAX_COST_CENTS || 0);

  let outcome;
  if (runtime === "cron" || runtime === "mcp-tool") {
    log(`invoking ${runtime} adapter for ${req.target_skill}`);
    outcome = invokeRuntimeAdapter(runtime, req.target_skill, req.run_id, inputsJson, timeoutMs);
  } else if (runtime === "claude-subagent" || runtime === "n8n-workflow") {
    if (!invokeAllowedForLlm) {
      // Gate off — record deferred and stop.
      const deferredEvent = {
        ts: new Date().toISOString(),
        event: "dispatch.deferred",
        runtime,
        reason: "YIELDE_BRIDGE_DISPATCH_INVOKE not set; LLM-cost runtimes require explicit opt-in",
      };
      await appendFile(runFile, JSON.stringify(deferredEvent) + "\n", "utf8");
      return {
        status: "succeeded",
        log: `dispatch.intent recorded at ${runFile}; runtime=${runtime} deferred (set YIELDE_BRIDGE_DISPATCH_INVOKE=1 to invoke)`,
      };
    }
    if (!maxCostCents) {
      const deferredEvent = {
        ts: new Date().toISOString(),
        event: "dispatch.deferred",
        runtime,
        reason: "YIELDE_BRIDGE_DISPATCH_MAX_COST_CENTS not set; refusing to invoke LLM runtime without an explicit cost cap",
      };
      await appendFile(runFile, JSON.stringify(deferredEvent) + "\n", "utf8");
      return {
        status: "succeeded",
        log: `dispatch.intent recorded at ${runFile}; runtime=${runtime} deferred (cost cap missing)`,
      };
    }
    log(`invoking claude -p for ${req.target_skill} (cost cap ${maxCostCents}c)`);
    outcome = invokeClaudeP(req.target_skill, req.run_id, inputsObj, timeoutMs);
  } else {
    return {
      status: "failed",
      log: `unknown runtime '${runtime}' for ${req.target_skill}; intent recorded at ${runFile}`,
    };
  }

  const invokedEvent = {
    ts: new Date().toISOString(),
    event: "dispatch.invoked",
    runtime,
    exit_code: outcome.exit,
    ok: outcome.ok,
    stdout_tail: (outcome.stdout || "").slice(-4000),
    stderr_tail: (outcome.stderr || "").slice(-2000),
    structured: outcome.structured ?? null,
  };
  await appendFile(runFile, JSON.stringify(invokedEvent) + "\n", "utf8");

  const endEvent = {
    ts: new Date().toISOString(),
    event: "operator.run.end",
    status: outcome.ok ? "success" : "error",
    source: "sweep-dispatches",
    exit_code: outcome.exit,
  };
  await appendFile(runFile, JSON.stringify(endEvent) + "\n", "utf8");

  return {
    status: outcome.ok ? "succeeded" : "failed",
    log: outcome.ok
      ? `operator-deploy ${runtime} ok (exit=${outcome.exit}); run log ${runFile}`
      : `operator-deploy ${runtime} failed (exit=${outcome.exit}): ${(outcome.stderr || outcome.stdout || "").slice(0, 300)}`,
  };
}

async function handleGithubIssue(req) {
  // Tier-2 fallback. Only attempts when `gh` is present and authenticated.
  const ghCheck = spawnSync("gh", ["auth", "status"], { encoding: "utf8" });
  if (ghCheck.status !== 0) {
    return {
      status: "failed",
      log: `gh CLI not available or not authenticated (exit ${ghCheck.status}): ${stripLibuvNoise(ghCheck.stderr || ghCheck.stdout || "")
        .trim()
        .slice(0, 300)}`,
    };
  }

  const title = `[operator-request] ${req.target_skill} via webhook ${req.slug}`;
  const body = [
    `Yielde Bridge dispatched a webhook delivery to an operator agent that is not present on this machine.`,
    ``,
    `**slug**: \`${req.slug}\``,
    `**target_skill**: \`${req.target_skill}\``,
    `**delivery_id**: ${req.delivery_id}`,
    `**run_id**: \`${req.run_id}\``,
    `**payload_hash**: \`${req.payload_hash}\``,
    `**received_at**: ${req.received_at}`,
    `**body_bytes**: ${req.body_bytes}`,
    ``,
    `Promote on the machine with the operator registry: \`/operator deploy ${req.target_skill}\`.`,
  ].join("\n");

  const repo = process.env.YIELDE_BRAIN_REPO ?? "Yielde-dev/brain";
  const create = spawnSync(
    "gh",
    ["issue", "create", "--repo", repo, "--label", "operator-request", "--title", title, "--body", body],
    { encoding: "utf8" },
  );
  if (create.status !== 0) {
    return {
      status: "failed",
      log: `gh issue create failed (exit ${create.status}): ${stripLibuvNoise(create.stderr || create.stdout || "")
        .trim()
        .slice(0, 300)}`,
    };
  }
  const url = (create.stdout || "").trim();
  return {
    status: "succeeded",
    log: `github-issue fallback opened: ${url}`,
  };
}

const HANDLERS = {
  "dry-run": handleDryRun,
  "operator-deploy": handleOperatorDeploy,
  "github-issue": handleGithubIssue,
};

// ---------- main sweep ----------

async function archiveFile(slug, filename, status) {
  const src = join(DISPATCH_ROOT, slug, filename);
  const dstDir = join(DISPATCH_ROOT, slug, "_processed", status);
  if (!existsSync(dstDir)) await mkdir(dstDir, { recursive: true });
  const dst = join(dstDir, filename);
  await rename(src, dst);
  return dst;
}

async function listSlugDirs() {
  if (!existsSync(DISPATCH_ROOT)) return [];
  const entries = await readdir(DISPATCH_ROOT, { withFileTypes: true });
  return entries.filter((e) => e.isDirectory() && !e.name.startsWith("_")).map((e) => e.name);
}

async function listQueueFiles(slug) {
  const dir = join(DISPATCH_ROOT, slug);
  const entries = await readdir(dir, { withFileTypes: true });
  return entries
    .filter((e) => e.isFile() && e.name.endsWith(".json"))
    .map((e) => e.name)
    .sort();
}

async function sweep() {
  const handler = HANDLERS[MODE];
  const slugs = await listSlugDirs();
  let processed = 0;
  let succeeded = 0;
  let failed = 0;
  const summary = [];

  outer: for (const slug of slugs) {
    let files;
    try {
      files = await listQueueFiles(slug);
    } catch (err) {
      log(`skip slug ${slug}: ${err.message}`);
      continue;
    }
    for (const filename of files) {
      if (processed >= LIMIT) break outer;
      const path = join(DISPATCH_ROOT, slug, filename);
      let req;
      try {
        req = await readJsonStrict(path);
      } catch (err) {
        log(`malformed queue file ${path}: ${err.message}`);
        // Park it in _processed/malformed so we don't loop on it forever.
        await archiveFile(slug, filename, "malformed").catch(() => {});
        summary.push({ slug, file: filename, status: "malformed", log: err.message });
        failed += 1;
        processed += 1;
        continue;
      }

      const required = ["delivery_id", "slug", "target_skill", "run_id", "payload_hash"];
      const missing = required.filter((k) => req[k] == null);
      if (missing.length) {
        const msg = `missing required fields: ${missing.join(", ")}`;
        log(`malformed ${path}: ${msg}`);
        await archiveFile(slug, filename, "malformed").catch(() => {});
        summary.push({ slug, file: filename, status: "malformed", log: msg });
        failed += 1;
        processed += 1;
        continue;
      }

      let outcome;
      try {
        outcome = await handler(req);
      } catch (err) {
        outcome = { status: "failed", log: `handler threw: ${err.message}` };
      }

      updateDispatch({
        id: req.delivery_id,
        status: outcome.status,
        target: req.target_skill,
        runId: req.run_id,
        log: outcome.log,
        dispatchedAt: new Date().toISOString(),
      });

      await archiveFile(slug, filename, outcome.status).catch((err) =>
        log(`archive failed for ${path}: ${err.message}`),
      );

      summary.push({
        slug,
        file: filename,
        delivery_id: req.delivery_id,
        target: req.target_skill,
        status: outcome.status,
        log: outcome.log,
      });
      processed += 1;
      if (outcome.status === "succeeded") succeeded += 1;
      else failed += 1;
    }
  }

  return { processed, succeeded, failed, summary };
}

try {
  const result = await sweep();
  console.log(
    JSON.stringify(
      {
        ok: true,
        mode: MODE,
        dispatch_root: DISPATCH_ROOT,
        runtime_db: RUNTIME_DB,
        processed: result.processed,
        succeeded: result.succeeded,
        failed: result.failed,
        entries: result.summary,
      },
      null,
      2,
    ),
  );
  process.exit(0);
} catch (err) {
  console.error(JSON.stringify({ ok: false, mode: MODE, error: err.message }));
  process.exit(1);
}
