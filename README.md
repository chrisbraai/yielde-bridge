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

## What's live (Phase 0)

- Three-room navigation chrome.
- **Configure / Skills** panel — reads `~/.claude/skills/` from filesystem, lists every installed skill with provenance badge, opens a per-skill viewer rendering the SKILL.md body with full frontmatter sidebar.
- All other panels are phase-stamped placeholders describing what they will ship.

See `app/` for the route layout and `lib/skills.ts` for the skill reader.

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
    └── yielde/  → JUNCTION → C:\Users\chris\yielde-skills\skills\yielde\

C:\Users\chris\
├── yielde-skills\         Hermes-compatible SKILL.md library (public, MIT)
├── yielde-bridge\         this repo — the dashboard UI
└── yielde-bridge-config\  registry: mcp.json, api.json, webhook.json, secret-refs.json (private)
```

## Stack

Next.js 16 (App Router, Turbopack) · TypeScript · Tailwind v4 · React 19. No client-side state library — Bridge reads filesystem on every render. Phase 3+ adds SQLite for run logs and webhook archive.

## Status

Phase 0 — foundation skills + UI shell. See the Yielde Bridge decision in yielde-brain (pending promotion from `_inbox/`).

## License

MIT.
