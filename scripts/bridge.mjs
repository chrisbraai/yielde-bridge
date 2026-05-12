#!/usr/bin/env node
/**
 * bridge — Yielde Bridge config CLI
 *
 * Reads/writes yielde-bridge-config/ and goes through git. Server routes never mutate
 * config — all writes funnel through this CLI.
 *
 * Subcommands:
 *   bridge sync                       — git pull --rebase the config repo
 *   bridge list mcp|api|webhook|secret-ref
 *   bridge add mcp <name> --transport <stdio|sse|http> [--command <cmd>] [--url <url>] [--env-ref X]
 *   bridge add api <name> --base-url <url> --auth-ref <ref> [--auth <method>] [--rpm <n>]
 *   bridge add webhook <slug> --target-skill <skill> --secret-ref <ref> [--verify hmac-sha256|none]
 *   bridge add webhook-out <name> --url <url> [--auth-ref <ref>] [--max-attempts <n>]
 *   bridge add secret-ref <name> --provider <infisical|os-keychain|env|gh-secret> --path <path>
 *   bridge remove <kind> <name>
 *
 * Hard rules:
 *   - never accept literal secret values; only references (handled by guard below)
 *   - every mutation commits + (best-effort) pushes
 */

import { readFile, writeFile, stat } from "node:fs/promises";
import { join } from "node:path";
import { homedir } from "node:os";
import { spawnSync } from "node:child_process";

const CONFIG_ROOT =
  process.env.YIELDE_BRIDGE_CONFIG_ROOT ||
  join(homedir(), "yielde-bridge-config");

const SCHEMA_VERSION = "1.0";

// ---------- arg parsing ----------

function parseArgs(argv) {
  const positional = [];
  const flags = {};
  const multi = new Set(["env-ref"]);
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith("--")) {
      const key = a.slice(2);
      const val = argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[++i] : true;
      if (multi.has(key)) {
        flags[key] = flags[key] || [];
        flags[key].push(val);
      } else {
        flags[key] = val;
      }
    } else {
      positional.push(a);
    }
  }
  return { positional, flags };
}

// ---------- secret guard ----------

const SECRET_PATTERNS = [
  /^sk-[A-Za-z0-9_-]{20,}$/,
  /^ghp_[A-Za-z0-9]{20,}$/,
  /^xox[bp]-[A-Za-z0-9-]+$/,
  /^AIza[0-9A-Za-z_-]{30,}$/,
  /^[A-Za-z0-9_-]{40,}\.[A-Za-z0-9_-]{40,}$/,
];

function assertNotASecret(label, value) {
  if (typeof value !== "string") return;
  for (const pat of SECRET_PATTERNS) {
    if (pat.test(value)) {
      console.error(
        `bridge: refusing to write — ${label} looks like a literal secret. Use a secret-ref instead.`
      );
      process.exit(2);
    }
  }
}

// ---------- registry I/O ----------

const REGISTRY_FILES = {
  mcp: "mcp.json",
  api: "api.json",
  webhook: "webhook.json",
  "secret-ref": "secret-refs.json",
};

const DEFAULT_BODY = {
  "mcp.json": { schema_version: SCHEMA_VERSION, updated: today(), servers: {} },
  "api.json": { schema_version: SCHEMA_VERSION, updated: today(), connectors: {} },
  "webhook.json": {
    schema_version: SCHEMA_VERSION,
    updated: today(),
    inbound: {},
    outbound: {},
  },
  "secret-refs.json": {
    schema_version: SCHEMA_VERSION,
    updated: today(),
    _comment:
      "REFERENCES ONLY. Never store credential values here. Each entry names a credential and where its value lives (infisical|keychain|env|gh-secret).",
    refs: {},
  },
};

function today() {
  return new Date().toISOString().slice(0, 10);
}

async function readFileJson(path) {
  try {
    const src = await readFile(path, "utf8");
    return JSON.parse(src);
  } catch {
    return null;
  }
}

async function readRegistry(file) {
  const path = join(CONFIG_ROOT, file);
  const existing = await readFileJson(path);
  if (existing) return existing;
  return structuredClone(DEFAULT_BODY[file]);
}

async function writeRegistry(file, body) {
  body.updated = today();
  body.schema_version = body.schema_version || SCHEMA_VERSION;
  const path = join(CONFIG_ROOT, file);
  const src = JSON.stringify(body, null, 2) + "\n";
  await writeFile(path, src, "utf8");
  return path;
}

// ---------- git helpers ----------

function git(args, opts = {}) {
  const res = spawnSync("git", args, {
    cwd: CONFIG_ROOT,
    stdio: opts.silent ? "pipe" : "inherit",
    encoding: "utf8",
  });
  return res;
}

async function ensureRepo() {
  try {
    const st = await stat(join(CONFIG_ROOT, ".git"));
    if (!st.isDirectory()) {
      console.error(`bridge: ${CONFIG_ROOT} is not a git repo (.git missing).`);
      process.exit(3);
    }
  } catch {
    console.error(
      `bridge: ${CONFIG_ROOT} not found. Set YIELDE_BRIDGE_CONFIG_ROOT or clone yielde-bridge-config there.`
    );
    process.exit(3);
  }
}

function commitAndMaybePush(file, message) {
  git(["add", file]);
  const status = git(["status", "--porcelain", file], { silent: true });
  if (!status.stdout || !status.stdout.trim()) {
    console.log(`bridge: nothing to commit for ${file}`);
    return;
  }
  const commit = git(["commit", "-m", message]);
  if (commit.status !== 0) {
    console.error(`bridge: git commit failed`);
    process.exit(4);
  }
  const push = git(["push"], { silent: true });
  if (push.status === 0) {
    console.log(`bridge: pushed ${message}`);
  } else {
    console.log(`bridge: committed locally (push skipped: ${(push.stderr || "").trim().split("\n").pop()})`);
  }
}

// ---------- subcommands ----------

async function cmdSync() {
  await ensureRepo();
  const pull = git(["pull", "--rebase", "--autostash"]);
  if (pull.status !== 0) process.exit(pull.status);
  console.log("bridge sync: ok");
}

async function cmdList(kind) {
  const file = REGISTRY_FILES[kind];
  if (!file) {
    console.error(`bridge list: unknown kind "${kind}". Use mcp|api|webhook|secret-ref.`);
    process.exit(1);
  }
  const body = await readRegistry(file);
  console.log(JSON.stringify(body, null, 2));
}

async function cmdAddMcp(name, flags) {
  if (!name) die("bridge add mcp <name>: name required");
  if (!flags.transport) die("--transport <stdio|sse|http> required");
  const transport = String(flags.transport);
  if (!["stdio", "sse", "http"].includes(transport))
    die(`--transport must be stdio|sse|http (got ${transport})`);

  const entry = { transport };
  if (flags.command) entry.command = String(flags.command);
  if (flags.url) entry.url = String(flags.url);
  if (flags["env-ref"]) entry.envRefs = flags["env-ref"];

  for (const key of ["command", "url"]) {
    if (entry[key]) assertNotASecret(`mcp.${name}.${key}`, entry[key]);
  }

  const body = await readRegistry("mcp.json");
  body.servers = body.servers || {};
  body.servers[name] = entry;
  await writeRegistry("mcp.json", body);
  commitAndMaybePush("mcp.json", `mcp: add ${name} (${transport})`);
}

async function cmdAddApi(name, flags) {
  if (!name) die("bridge add api <name>: name required");
  if (!flags["base-url"]) die("--base-url required");
  if (!flags["auth-ref"]) die("--auth-ref required (no literals)");
  assertNotASecret(`api.${name}.authRef`, flags["auth-ref"]);

  const entry = {
    baseUrl: String(flags["base-url"]),
    authRef: String(flags["auth-ref"]),
  };
  if (flags.auth) entry.authMethod = String(flags.auth);
  if (flags.rpm) entry.rateLimit = { rpm: parseInt(flags.rpm, 10) };

  const body = await readRegistry("api.json");
  body.connectors = body.connectors || {};
  body.connectors[name] = entry;
  await writeRegistry("api.json", body);
  commitAndMaybePush("api.json", `api: add ${name} (${entry.baseUrl})`);
}

async function cmdAddWebhook(slug, flags) {
  if (!slug) die("bridge add webhook <slug>: slug required");
  if (!flags["target-skill"]) die("--target-skill required");
  if (!flags["secret-ref"]) die("--secret-ref required (no literals)");
  assertNotASecret(`webhook.inbound.${slug}.secretRef`, flags["secret-ref"]);

  const entry = {
    targetSkill: String(flags["target-skill"]),
    secretRef: String(flags["secret-ref"]),
    verifySig: flags.verify ? String(flags.verify) : "hmac-sha256",
  };
  if (!["hmac-sha256", "none"].includes(entry.verifySig))
    die(`--verify must be hmac-sha256 or none`);

  const body = await readRegistry("webhook.json");
  body.inbound = body.inbound || {};
  body.inbound[slug] = entry;
  await writeRegistry("webhook.json", body);
  commitAndMaybePush("webhook.json", `webhook: add inbound ${slug} → ${entry.targetSkill}`);
}

async function cmdAddWebhookOut(name, flags) {
  if (!name) die("bridge add webhook-out <name>: name required");
  if (!flags.url) die("--url required");
  assertNotASecret(`webhook.outbound.${name}.url`, flags.url);

  const entry = { url: String(flags.url) };
  if (flags["auth-ref"]) {
    assertNotASecret(`webhook.outbound.${name}.authRef`, flags["auth-ref"]);
    entry.authRef = String(flags["auth-ref"]);
  }
  if (flags["max-attempts"])
    entry.retryPolicy = { maxAttempts: parseInt(flags["max-attempts"], 10) };

  const body = await readRegistry("webhook.json");
  body.outbound = body.outbound || {};
  body.outbound[name] = entry;
  await writeRegistry("webhook.json", body);
  commitAndMaybePush("webhook.json", `webhook: add outbound ${name}`);
}

async function cmdAddSecretRef(name, flags) {
  if (!name) die("bridge add secret-ref <name>: name required");
  if (!flags.provider) die("--provider <infisical|os-keychain|env|gh-secret> required");
  if (!flags.path) die("--path <path> required (path, NOT value)");

  const provider = String(flags.provider);
  if (!["infisical", "os-keychain", "env", "gh-secret"].includes(provider))
    die(`--provider must be infisical|os-keychain|env|gh-secret (got ${provider})`);

  assertNotASecret(`secret-refs.${name}.path`, flags.path);

  const entry = { provider, path: String(flags.path) };
  const body = await readRegistry("secret-refs.json");
  body.refs = body.refs || {};
  body.refs[name] = entry;
  await writeRegistry("secret-refs.json", body);
  commitAndMaybePush(
    "secret-refs.json",
    `secret-ref: add ${name} (${provider})`
  );
}

async function cmdRemove(kind, name) {
  if (!kind || !name) die("bridge remove <kind> <name>");
  if (kind === "mcp") {
    const body = await readRegistry("mcp.json");
    if (!body.servers?.[name]) die(`no mcp server "${name}"`);
    delete body.servers[name];
    await writeRegistry("mcp.json", body);
    commitAndMaybePush("mcp.json", `mcp: remove ${name}`);
  } else if (kind === "api") {
    const body = await readRegistry("api.json");
    if (!body.connectors?.[name]) die(`no api connector "${name}"`);
    delete body.connectors[name];
    await writeRegistry("api.json", body);
    commitAndMaybePush("api.json", `api: remove ${name}`);
  } else if (kind === "webhook") {
    const body = await readRegistry("webhook.json");
    if (body.inbound?.[name]) delete body.inbound[name];
    else if (body.outbound?.[name]) delete body.outbound[name];
    else die(`no webhook "${name}"`);
    await writeRegistry("webhook.json", body);
    commitAndMaybePush("webhook.json", `webhook: remove ${name}`);
  } else if (kind === "secret-ref") {
    const body = await readRegistry("secret-refs.json");
    if (!body.refs?.[name]) die(`no secret-ref "${name}"`);
    delete body.refs[name];
    await writeRegistry("secret-refs.json", body);
    commitAndMaybePush("secret-refs.json", `secret-ref: remove ${name}`);
  } else {
    die(`unknown kind "${kind}"`);
  }
}

function die(msg) {
  console.error(`bridge: ${msg}`);
  process.exit(1);
}

function usage() {
  console.log(`bridge — Yielde Bridge config CLI

Reads/writes ${CONFIG_ROOT}

Usage:
  bridge sync
  bridge list mcp|api|webhook|secret-ref
  bridge add mcp <name> --transport stdio|sse|http [--command CMD] [--url URL] [--env-ref REF ...]
  bridge add api <name> --base-url URL --auth-ref REF [--auth bearer|api-key|oauth|basic|none] [--rpm N]
  bridge add webhook <slug> --target-skill SKILL --secret-ref REF [--verify hmac-sha256|none]
  bridge add webhook-out <name> --url URL [--auth-ref REF] [--max-attempts N]
  bridge add secret-ref <name> --provider infisical|os-keychain|env|gh-secret --path PATH
  bridge remove mcp|api|webhook|secret-ref <name>

Env:
  YIELDE_BRIDGE_CONFIG_ROOT  override config repo path (default ~/yielde-bridge-config)
`);
}

// ---------- main ----------

const [, , cmd, sub, third, ...rest] = process.argv;

if (!cmd || cmd === "help" || cmd === "--help" || cmd === "-h") {
  usage();
  process.exit(0);
}

const { positional, flags } = parseArgs(rest);
const writeCommands = new Set(["add", "remove", "sync"]);

if (writeCommands.has(cmd)) await ensureRepo();

if (cmd === "sync") {
  await cmdSync();
} else if (cmd === "list") {
  await cmdList(sub);
} else if (cmd === "add") {
  if (sub === "mcp") await cmdAddMcp(third, flags);
  else if (sub === "api") await cmdAddApi(third, flags);
  else if (sub === "webhook") await cmdAddWebhook(third, flags);
  else if (sub === "webhook-out") await cmdAddWebhookOut(third, flags);
  else if (sub === "secret-ref") await cmdAddSecretRef(third, flags);
  else die(`unknown add target "${sub}"`);
} else if (cmd === "remove") {
  await cmdRemove(sub, third);
} else {
  usage();
  process.exit(1);
}

// silence "unused" lint on positional shim
void positional;
