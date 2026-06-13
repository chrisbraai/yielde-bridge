<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Yielde Bridge — agent notes

## Project shape

- `app/` — four rooms (`configure/`, `run/`, `inspect/`, `library/`). Each room has its own layout. The Configure room covers writable registries only (MCP / API / Webhooks / Secrets) — Skills and Capabilities used to live here but moved to Library, since they're read-only browse surfaces. The Inspect room is read-only over kernel audit, brain `_inbox/` drafts, capability decisions, and skill telemetry. The Library room is a personal-use surface over every installed skill (`~/.claude/skills/`), every operator agent (`~/.claude/operator/agents/`), every deterministic script (`~/.claude/scripts/`), and every Yielde-OS capability (`~/.claude/os/capabilities/registry.json`); reads filesystem on every render. Skill/agent cards copy the name; script cards copy the runnable command — scripts do NOT call an LLM, the driving agent invokes them directly via Bash. Capabilities render as positive, grouped tables of what the agent CAN do — Active / Installable agentic tooling (category G) + Privileged operations — filtered to affirmative (`available:true`) entries only; refusal boundaries stay in `registry.json` for the OS gate and are NOT shown here (a muted footer notes their count). Read-only mirror of Yielde OS, not a copy-card grid. Cards opt into a "view more →" pill by setting `LibraryItem.detailHref`; skill cards link to `/library/skills/[category]/[name]` which renders the SKILL.md body + frontmatter sidebar via `readSkill`.
- `lib/skills.ts` — server-side reader for `~/.claude/skills/` (the canonical Claude Code skills path). Yielde skills live under `skills/yielde/` via a Windows directory junction to `yielde-skills/skills/yielde/`.
- `lib/scripts.ts` — server-side reader for `~/.claude/scripts/`. Each file is a directly-runnable artifact (`.mjs/.cjs/.js/.ts/.ps1/.psm1/.py/.sh/.bash/.zsh/.bat/.cmd`). Runtime is derived from the extension; category is either an explicit subfolder name or the runtime if the file sits at the root. Description parsed from a leading comment block (`description:` key, else first meaningful comment line).
- `lib/json-io.ts` — single seam for JSON file reads. PowerShell writes UTF-8 BOM; raw `readFile + JSON.parse` is forbidden under `lib/`. Markdown/JSONL readers may stay direct.
- `lib/runtime.ts` — `better-sqlite3` wrapper for `~/.claude/bridge/runtime/runtime.db`. Three tables: `webhook_deliveries`, `operator_runs`, `sessions`. Sync API; wrap reads in `force-dynamic` pages.
- `lib/markdown.ts` — minimal dependency-free markdown → HTML renderer for SKILL.md bodies.
- `lib/time.ts` — shared `fmtTimestamp(ts, { stripMillis? })`. Use this for any kernel/runtime timestamp display.
- `components/` — small, presentational. No data fetching in components — pass props from server pages, or subscribe to SSE from a client component (see `webhook-tail-live.tsx`).

## Rules

1. **Never write to `yielde-brain/` from this app.** Audit-enforced writes are the `brain-gatekeeper` skill's job. Bridge surfaces drafts; it never creates them. `/brain-log promote` is Chris-only.
2. **Never store credential values.** `secret-refs.json` holds references only. Webhook secrets resolve per request via `lib/secret-resolver.ts`; nothing caches them. Dispatcher never sees the secret.
3. **Bridge writes are restricted to documented surfaces.** Registry mutations only via `scripts/bridge.mjs` + git into `yielde-bridge-config/`. Server routes never touch `yielde-bridge-config/`. Runtime state writes are limited to: `lib/runtime.ts` (→ `runtime.db`), `lib/dispatcher.ts` (→ JSON files at `~/.claude/bridge/dispatches/<slug>/<run-id>.json`), `lib/usage.ts` (→ `~/.claude/skills/.usage.json`), and `lib/pins.ts` (→ `~/.claude/bridge/pins.json`). All atomic-write paths use `writeJsonAtomic` from `lib/json-io.ts` — never re-implement the tmp+rename pattern.
4. **Always `force-dynamic` server pages that read state.** Filesystem and `runtime.db` change between requests; static generation would lie.
5. **HTTP 200 ≠ feature working.** Every verification gate (Configure / Run / Inspect / Library) needs a content assertion (regex grep for a known substring), not just a status code. Pages can render an empty state behind a 200.
6. **Next.js routing gotchas.** Folders prefixed `_` are private and return 405 — keep routes flat or use non-underscore names (the SSE endpoint lives at `/api/webhook-stream/`, not `/api/webhooks/_stream/`). Schema migrations on `runtime.db` use idempotent `PRAGMA table_info` checks before `ALTER TABLE ADD COLUMN`.
7. **React 19 purity in client components.** Never call `Date.now()` (or other impure functions) during render. Hold `now` in `useState`, update via `useEffect` + `setInterval`; do NOT set state synchronously inside the effect body (`react-hooks/set-state-in-effect`) — let the first tick land. Pattern in `webhook-tail-live.tsx`.
