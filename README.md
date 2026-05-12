# Yielde Bridge

> Local-first master dashboard for Yielde OS — unifies MCP servers, API connectors, webhooks, skills, and audit under one UI at `http://localhost:3030`.

## What it is

Yielde Bridge is the dashboard layer on top of **Yielde OS** (`~/.claude/os/`) and `/operator` (`~/.claude/operator/`). It does not replace either — it provides a human-friendly window into them, plus a new connector hub and skill library.

Three rooms, modelled on Bridgemind's BridgeSpace pattern:

| Room | What you do here |
|---|---|
| **Configure** | Register MCP servers, API connectors, webhooks, skills, secret references, capabilities. |
| **Run** | See active sessions, `/operator` recent runs, webhook deliveries, cost meter, scheduled fires. |
| **Inspect** | Search audit log, review `yielde-brain/_inbox/` drafts with diff + promote, see capability decisions, skill traces, eval scores. |

## What's live (Phase 2)

- Three-room navigation chrome with live count badges on each Configure panel.
- **Configure / Skills** — reads `~/.claude/skills/` from filesystem, lists every installed skill with provenance badge, 14-day usage sparkline, and a per-skill viewer rendering the SKILL.md body with full frontmatter sidebar.
- **Configure / MCP, API, Webhooks, Secret refs** — read `yielde-bridge-config/{mcp,api,webhook,secret-refs}.json` and render typed tables. Empty registries surface the `bridge` CLI hint inline.
- **Configure / Capabilities** — read-only mirror of `~/.claude/os/capabilities/registry.json`, grouped by category A–F with `allowed` / `refused` / `hard-gate` badges per row.
- **Import-from-Hermes** modal (`+ Import from Hermes URL`) — accepts a slug, `owner/repo:path`, or full GitHub URL; calls `POST /api/skills/import-hermes` which shells out to `yielde-skills/scripts/import-hermes.mjs` and refreshes the table on success.
- **Usage telemetry** — `POST /api/skills/use { name }` increments a 14-day rolling history in `~/.claude/skills/.usage.json` (atomic write via temp + rename). Sparklines read the same file.
- **`bridge` CLI** — `node scripts/bridge.mjs sync|list|add|remove …` mutates `yielde-bridge-config/` via git, with a regex-based secret-leak guard. See [HANDOFF.md](./HANDOFF.md) for the full subcommand cheatsheet.
- Run / Inspect rooms remain phase-stamped placeholders.

See `app/` for the route layout, `lib/skills.ts` + `lib/config.ts` for the registry readers, `lib/usage.ts` for the telemetry sidecar, and `scripts/bridge.mjs` for the config CLI.

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

Next.js 16 (App Router, Turbopack) · TypeScript · Tailwind v4 · React 19. No client-side state library — Bridge reads filesystem on every render. Phase 3+ adds SQLite for run logs and webhook archive.

## Status

Phase 2 — registries + Configure panels + `bridge` CLI shipped 2026-05-12 (`c6bf4d6`). Phase 3 (Run room: live sessions, operator runs, webhook tail, cost meter, SQLite-backed webhook archive) is next.

For a fresh-session handoff, read [HANDOFF.md](./HANDOFF.md) — contains a literal resume prompt, the Phase 3 plan, open follow-ups, and a smoke-test gate.

## License

MIT.
