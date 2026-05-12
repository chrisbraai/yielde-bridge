<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Yielde Bridge — agent notes

## Project shape

- `app/` — three rooms (`configure/`, `run/`, `inspect/`). Each room has its own layout. The Inspect room is read-only over kernel audit, brain `_inbox/` drafts, capability decisions, and skill telemetry.
- `lib/skills.ts` — server-side reader for `~/.claude/skills/` (the canonical Claude Code skills path). Yielde skills live under `skills/yielde/` via a Windows directory junction to `yielde-skills/skills/yielde/`.
- `lib/json-io.ts` — single seam for JSON file reads. PowerShell writes UTF-8 BOM; raw `readFile + JSON.parse` is forbidden under `lib/`. Markdown/JSONL readers may stay direct.
- `lib/runtime.ts` — `better-sqlite3` wrapper for `~/.claude/bridge/runtime/runtime.db`. Three tables: `webhook_deliveries`, `operator_runs`, `sessions`. Sync API; wrap reads in `force-dynamic` pages.
- `lib/markdown.ts` — minimal dependency-free markdown → HTML renderer for SKILL.md bodies.
- `lib/time.ts` — shared `fmtTimestamp(ts, { stripMillis? })`. Use this for any kernel/runtime timestamp display.
- `components/` — small, presentational. No data fetching in components — pass props from server pages, or subscribe to SSE from a client component (see `webhook-tail-live.tsx`).

## Rules

1. **Never write to `yielde-brain/` from this app.** Audit-enforced writes are the `brain-gatekeeper` skill's job. Bridge surfaces drafts; it never creates them. `/brain-log promote` is Chris-only.
2. **Never store credential values.** `secret-refs.json` holds references only. Webhook secrets resolve per request via `lib/secret-resolver.ts`; nothing caches them. Dispatcher never sees the secret.
3. **Bridge writes through TWO surfaces only.** Registry mutations via `scripts/bridge.mjs` + git into `yielde-bridge-config/`. Runtime state via `lib/runtime.ts` (→ `runtime.db`) and `lib/dispatcher.ts` (→ JSON files at `~/.claude/bridge/dispatches/<slug>/<run-id>.json`). Server routes never touch `yielde-bridge-config/`.
4. **Always `force-dynamic` server pages that read state.** Filesystem and `runtime.db` change between requests; static generation would lie.
5. **HTTP 200 ≠ feature working.** Every verification gate (Configure / Run / Inspect) needs a content assertion (regex grep for a known substring), not just a status code. Pages can render an empty state behind a 200.
6. **Next.js routing gotchas.** Folders prefixed `_` are private and return 405 — keep routes flat or use non-underscore names (the SSE endpoint lives at `/api/webhook-stream/`, not `/api/webhooks/_stream/`). Schema migrations on `runtime.db` use idempotent `PRAGMA table_info` checks before `ALTER TABLE ADD COLUMN`.
7. **React 19 purity in client components.** Never call `Date.now()` (or other impure functions) during render. Hold `now` in `useState`, update via `useEffect` + `setInterval`; do NOT set state synchronously inside the effect body (`react-hooks/set-state-in-effect`) — let the first tick land. Pattern in `webhook-tail-live.tsx`.
