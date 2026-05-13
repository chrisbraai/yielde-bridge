# Yielde Bridge

> Local-first master dashboard for Yielde OS — unifies MCP servers, API connectors, webhooks, skills, and audit under one UI at `http://localhost:3030`.

## What it is

Yielde Bridge is the dashboard layer on top of **Yielde OS** (`~/.claude/os/`) and `/operator` (`~/.claude/operator/`). It does not replace either — it provides a human-friendly window into them, plus a new connector hub and skill library.

Four rooms, modelled on Bridgemind's BridgeSpace pattern:

| Room | What you do here |
|---|---|
| **Configure** | Register MCP servers, API connectors, webhooks, skills, secret references, capabilities. |
| **Run** | See active sessions, `/operator` recent runs, webhook deliveries, cost meter, scheduled fires. |
| **Inspect** | Search audit log, review `yielde-brain/_inbox/` drafts with diff + promote, see capability decisions, skill traces, eval scores. |
| **Library** | Personal-use catalogue of every installed skill (`~/.claude/skills/`) and every operator agent (`~/.claude/operator/agents/`), searchable, with click-to-copy name pills. |

## What's live (Phase 3)

### Configure room (Phase 2)
- Three-room navigation chrome with live count badges on each Configure panel.
- **Configure / Skills** — reads `~/.claude/skills/` from filesystem, lists every installed skill with provenance badge, 14-day usage sparkline, and a per-skill viewer rendering the SKILL.md body with full frontmatter sidebar.
- **Configure / MCP, API, Webhooks, Secret refs** — read `yielde-bridge-config/{mcp,api,webhook,secret-refs}.json` and render typed tables. Empty registries surface the `bridge` CLI hint inline.
- **Configure / Capabilities** — read-only mirror of `~/.claude/os/capabilities/registry.json`, grouped by category A–F with `allowed` / `refused` / `hard-gate` badges per row.
- **Import-from-Hermes** modal — accepts a slug, `owner/repo:path`, or full GitHub URL; calls `POST /api/skills/import-hermes`.
- **Usage telemetry** — `POST /api/skills/use { name }` increments a 14-day rolling history in `~/.claude/skills/.usage.json`.
- **`bridge` CLI** — `node scripts/bridge.mjs sync|list|add|remove …` mutates `yielde-bridge-config/` via git, with a regex-based secret-leak guard.

### Run room (Phase 3)
- **Run / Overview** — 4 stat cards (active sessions, operator runs, webhook deliveries, 14-day cost) plus recent operator runs and webhook deliveries.
- **Run / Sessions** — live view over `~/.claude/os/sessions.json`. Active sessions first, with role / status / intent / heartbeat columns.
- **Run / Operator** — `/operator deploy <agent>` runs synced from `~/.claude/operator/runs/<agent>/*.jsonl` into `runtime.db`. Last 50 across all agents, with duration, tokens, and cost.
- **Run / Webhook tail** — last 100 inbound deliveries across all configured slugs. 100-per-slug retention.
- **Run / Cost** — 14-day daily rollup from sessions + operator runs, stacked bar per day, 3 totals cards.
- **`POST /api/webhooks/[slug]`** — HMAC-SHA256 receiver. Accepts `x-signature`, `x-hub-signature-256`, or `x-yielde-signature` (strips `sha256=` prefix). Slug lookup in `webhook.json.inbound`; unknown slug → 404 (logged). Missing/mismatched signature → 401 (logged). Secret resolve failure → 503 (logged). Accepted → 202 with raw body archived to `webhook_deliveries.body_blob` for replay.
- **`lib/runtime.ts`** — SQLite (better-sqlite3) wrapper at `~/.claude/bridge/runtime/runtime.db`. WAL journal, foreign keys on, schema init on first read. Override path via `YIELDE_BRIDGE_RUNTIME_DB`.
- **`lib/secret-resolver.ts`** — per-request secret resolution. `env` provider works end-to-end; `infisical` / `os-keychain` / `gh-secret` throw a typed `SecretResolveError` so the webhook route returns a clean 503 instead of silently passing through. Resolved values are never cached across requests.

Inspect room remains a phase-stamped placeholder.

See `app/` for the route layout, `lib/skills.ts` + `lib/config.ts` + `lib/runtime.ts` + `lib/sessions.ts` + `lib/operator-runs.ts` for the readers, `lib/usage.ts` + `lib/secret-resolver.ts` for sidecars, and `scripts/bridge.mjs` for the config CLI.

## Running locally

```bash
npm install
npm run dev
# → http://localhost:3030
```

## Architecture

```
~/.claude/
├── os/                    Yielde OS substrate (kernel, sessions, audit, capabilities)
├── operator/              /operator agent registry + runs
└── skills/
    ├── yielde/  → JUNCTION → C:\Users\chris\yielde-skills\skills\yielde\
    ├── hermes/  → JUNCTION → C:\Users\chris\yielde-skills\skills\hermes\
    └── .usage.json        14-day rolling telemetry (written by Bridge)

C:\Users\chris\
├── yielde-skills\         Hermes-compatible SKILL.md library (public, MIT)
├── yielde-bridge\         this repo — the dashboard UI
└── yielde-bridge-config\  registry: mcp.json, api.json, webhook.json, secret-refs.json (private)
```

## Stack

Next.js 16 (App Router, Turbopack) · TypeScript · Tailwind v4 · React 19 · better-sqlite3 (Phase 3+ runtime). Registry reads stay filesystem-on-render; runtime state (webhook archive, operator-run cache) is in SQLite at `~/.claude/bridge/runtime/runtime.db`.

## Status

- Phase 2 — registries + Configure panels + `bridge` CLI (`c6bf4d6`).
- Phase 3 — Run room + SQLite runtime + HMAC webhook receiver, shipped 2026-05-12.
- Phase 4 (next) — Inspect room, real skill dispatch from webhook receiver, redaction + retention sweep on archived bodies, real-time tail via SSE.

For a fresh-session handoff, read [HANDOFF.md](./HANDOFF.md) — contains a literal resume prompt, the next-phase plan, open follow-ups, and a smoke-test gate.

## License

MIT.
