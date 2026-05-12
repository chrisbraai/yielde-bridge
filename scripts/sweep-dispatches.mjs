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
 *   github-issue    — open a GitHub issue against chrisbraai/yielde-brain with the dispatch
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
import { readdir, readFile, writeFile, mkdir, rename, appendFile } from "node:fs/promises";
import { existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { homedir } from "node:os";
import { spawnSync } from "node:child_process";

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

function stripBom(s) {
  return s.charCodeAt(0) === 0xfeff ? s.slice(1) : s;
}

async function readJsonStrict(path) {
  const src = stripBom(await readFile(path, "utf8"));
  return JSON.parse(src);
}

function log(...parts) {
  if (VERBOSE) console.log("[sweep]", ...parts);
}

function stripLibuvNoise(s) {
  // Windows libuv UV_HANDLE_CLOSING assertion can sneak into stderr on child shutdown.
  if (!s) return s;
  return s
    .split(/\r?\n/)
    .filter((line) => !/Assertion failed:.*UV_HANDLE_CLOSING/.test(line))
    .join("\n");
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
  const now = new Date().toISOString();
  const events = [
    {
      ts: now,
      event: "dispatch.intent",
      source: "yielde-bridge.webhook",
      delivery_id: req.delivery_id,
      slug: req.slug,
      run_id: req.run_id,
      payload_hash: req.payload_hash,
    },
    {
      ts: now,
      event: "dispatch.queued",
      note: "Sweeper recorded dispatch intent. Actual /operator deploy invocation is the caller's responsibility (cron or interactive).",
    },
  ];
  await writeFile(runFile, events.map((e) => JSON.stringify(e)).join("\n") + "\n", "utf8");
  return {
    status: "succeeded",
    log: `operator-deploy intent recorded at ${runFile}`,
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

  const repo = process.env.YIELDE_BRAIN_REPO ?? "chrisbraai/yielde-brain";
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
