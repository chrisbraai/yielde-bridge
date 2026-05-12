# Yielde Bridge — handoff (post Phase 4)

Last session: 2026-05-12, ended after Phase 4 ship (Inspect room + real dispatch + per-slug redaction + retention + SSE tail + session-sync seam). Next session picks up Phase 5 (queue worker that consumes `~/.claude/bridge/dispatches/`, kernel-side `session.cost` event, co-founder rollout).

Repo HEADs at handoff:

| Repo | HEAD | Branch |
|---|---|---|
| `yielde-bridge` | `1ad2913` | `main` |
| `yielde-bridge-config` | `fb05d0d` (net-zero after smoke teardown vs `cef0d72`) | `main` |
| `yielde-brain` | `1e3c646` (Phase 4 draft in `_inbox/`, awaiting `/brain-log promote`) | `master` |

---

## Handoff prompt (paste into a fresh Claude Code session)

> Resume Yielde Bridge Phase 5.
>
> 1. Read `~/.claude/projects/C--Users-chris/memory/project_yielde_bridge.md` — Phase 0–4 ✅. Run all 11 "Verification on session resume" checks in that file before touching code. Each check carries a content assertion. Confirm `yielde-bridge` HEAD is `1ad2913` (or descendant), `yielde-bridge-config` HEAD is `fb05d0d`, `yielde-brain` HEAD is `1e3c646` (or descendant).
> 2. Read `C:\Users\chris\yielde-bridge\HANDOFF.md` (this file) for the Phase 5 plan, hard rules, open follow-ups, and smoke tests.
> 3. Read `C:\Users\chris\yielde-bridge\AGENTS.md` — Next.js 16 / Turbopack / React 19 quirks plus the load-bearing **rule #3** (Bridge writes via `runtime.db`, never to `yielde-bridge-config/` from server routes).
> 4. **Do NOT load `~/.claude/CLAUDE.md`'s full brain index unless a task explicitly touches `yielde-platform`, `yielde-site`, a client slug, or co-founder work.** Brain writes still go through `brain-gatekeeper`'s `_inbox/` rules — never edit canonical paths.
> 5. **Hard rules to preserve** (full list in HANDOFF.md § Hard rules):
>    - Bridge reads-only from `yielde-bridge-config/`; all writes go through `scripts/bridge.mjs` or `runtime.db`.
>    - All `lib/` JSON readers MUST go through `lib/json-io.ts`. Raw `readFile + JSON.parse` is forbidden under `lib/`.
>    - Webhook secrets resolved per request via `lib/secret-resolver.ts`; never cached.
>    - File-guard pattern blocks `secrets` (plural). Use singular.
>    - HTTP 200 ≠ feature working. Verification gates need content assertions.
>    - Next.js routes: avoid `_underscore` parent folders — they return 405. Date.now() in client component render is a `react-hooks/purity` error.
> 6. Start Phase 5 work:
>    - Queue worker for `~/.claude/bridge/dispatches/<slug>/*.json`. Most likely a `/operator deploy webhook-dispatch-sweep` agent + a small Node CLI invoked by it. Worker updates `webhook_deliveries.dispatch_status` to `succeeded` or `failed`. Reuse `scripts/record-session-close.mjs` pattern.
>    - Kernel-side `session.cost` audit event. Append to `~/.claude/os/audit.jsonl` on session close with `tokens_in/tokens_out/cost_cents/model`. Kernel shells out to `node ~/.claude/bridge/cli/record-session-close.mjs` (or copy of `scripts/record-session-close.mjs`) so cost rollup populates. This is `~/.claude/os/` work, not in-repo.
>    - Co-founder rollout: Node-only CLI fallback in `operator-bridge` skill for Devon/Lyell, GitHub-issue handoff path.
>    - Badge consolidation: 8+ inline clones across Configure/Run/Inspect now exist. Pull the trigger on a generic `<Badge variant>` component.
> 7. At meaningful milestones, write a draft to `yielde-brain/_inbox/YYYY-MM-DD-HHMM-<slug>.md` per the `brain-gatekeeper` schema, commit, and push. Never silent, never canonical.
>
> Work without stopping to ask clarifying questions when the reasonable call is obvious. Use TaskCreate to track multi-step work.

---

## What shipped (Phase 4)

| Repo | Commits | Highlights |
|---|---|---|
| `yielde-bridge` | `df8199b → c9f02ec` | Inspect room (4 panels + overview) · real dispatch (`dispatcher.ts`, queue files at `~/.claude/bridge/dispatches/`) · redaction (`redaction.ts`, JSON-key + regex) · 6-column runtime.db migration · per-slug retention + CLI flags (`--retention`, `--redact-key`, `--redact-pattern`) · SSE tail at `/api/webhook-stream` + `webhook-tail-live.tsx` client · session-sync from `audit.jsonl` + `scripts/record-session-close.mjs` seam |
| `yielde-bridge-config` | `fb05d0d` → `…` → `fb05d0d` | smoke fixture round-trip — 4 commits, net-zero |
| `yielde-brain` | `5ca2362 → 1e3c646` | `_inbox/2026-05-12-1530-yielde-bridge-phase-4-shipped.md` |

**Files in `yielde-bridge` that landed this phase:**

- **`lib/audit.ts`** — typed reader over `~/.claude/os/audit.jsonl`. `listAuditEvents({q, event, sessionId, limit})` walks newest→oldest, applies filters. `auditEventCounts()` aggregates. No JSON files involved (JSONL), so no BOM concern.
- **`lib/brain-inbox.ts`** — read-only `~/yielde-brain/_inbox/*.md` reader. Parses YAML frontmatter via `parseFrontmatter` (re-export from `lib/skills.ts`). Lists drafts newest-first. Never writes; promotion stays `/brain-log promote`-only.
- **`lib/redaction.ts`** — JSON-aware key rule + regex rule. Tries JSON parse first; falls back to raw regex over utf-8 if parse fails. Returns `{ body, applied, notes }` for traceability.
- **`lib/dispatcher.ts`** — `dispatchAcceptedDelivery({ deliveryId, slug, targetSkill, … })`. `noop` short-circuits to `succeeded`; everything else writes a JSON queue file. Failures land as `dispatch_status=failed` with the error in `dispatch_log`.
- **`lib/session-sync.ts`** — reads `audit.jsonl`, upserts `session.started`/`intent.set`/`session.stopped`/`session.cost` events into the `sessions` table. The `session.cost` branch is the long-term consumer; Phase 4 only fills the first three.
- **`lib/runtime.ts` migration** — idempotent: `PRAGMA table_info(webhook_deliveries)` check, then `ALTER TABLE ADD COLUMN` for `dispatch_status`/`dispatch_target`/`dispatch_run_id`/`dispatched_at`/`dispatch_log`/`redaction_applied`. New `WebhookDelivery` shape exposes them. Added `updateDispatch()`, `listWebhookDeliveriesSince()`, `maxWebhookDeliveryId()`, `upsertSession()`, `listRecentSessionsFromDb()`, `setRetentionLimits()`, `pruneAllRetention()`.
- **`lib/config.ts`** — `WebhookInbound` extended with `retentionLimit?: number` and `redactionRules?: RedactionRule[]`.
- **`app/api/webhooks/[slug]/route.ts`** — Phase 3 receiver now applies `redactBody()` before `insertWebhookDelivery`, pushes per-slug retention via `setRetentionLimits`, and calls `dispatchAcceptedDelivery` on accept. Response body includes `delivery_id`, `dispatch.status`, `dispatch.run_id`, `redacted`.
- **`app/api/webhook-stream/route.ts`** — SSE GET endpoint. Seeds with the most recent rows (oldest-first), then polls `listWebhookDeliveriesSince` at 1Hz. Heartbeat every 15s. Respects `req.signal.aborted`. **Path note**: lives at `/api/webhook-stream/`, NOT `/api/webhooks/_stream/` — Next.js treats `_`-prefixed folders as private and returns 405.
- **`app/inspect/{audit-search,brain-inbox,capability-decisions,skill-traces}/page.tsx`** + **`app/inspect/page.tsx`** + **`app/inspect/layout.tsx`** — Inspect room replaces `PhasePlaceholder`. Layout wraps in `InspectNav` (server) + `InspectNavLinks` (client) matching the Configure/Run split.
- **`app/run/webhook-tail/page.tsx`** + **`components/webhook-tail-live.tsx`** — page now hands seed rows to a client component subscribing to SSE. In-place row updates when `dispatch_status` flips after accept. 1Hz now-state via `useState`+`useEffect` (React 19 purity rule: no `Date.now()` during render).
- **`app/run/cost/page.tsx`** — wires `syncSessionsFromAudit()` so the sessions table backfills from `audit.jsonl` on render. Cost rollup remains zero until kernel `session.cost` telemetry lands.
- **`scripts/bridge.mjs`** — `add webhook` gained `--retention N`, `--redact-key K` (multi), `--redact-pattern REGEX` (multi). Patterns validated client-side before write.
- **`scripts/record-session-close.mjs`** — PowerShell-callable kernel seam. Takes `--id`, `--ended-at`, `--model`, `--tokens-in`, `--tokens-out`, `--cost-cents`, `--role`, `--intent`, `--harness`. Idempotent UPSERT into `sessions`.
- **`scripts/probe-stored.mjs`** — inspects the most recent `webhook_deliveries` row (id, dispatch state, redaction flag, body).
- **`scripts/probe-stream.mjs`** — short-lived SSE consumer for smoke testing the stream endpoint.

---

## Phase 5 plan (queue worker + kernel cost telemetry + co-founder rollout)

### Files to land (`yielde-bridge`)

1. **Queue worker.** Two surfaces likely:
   - `scripts/sweep-dispatches.mjs` — Node script that scans `~/.claude/bridge/dispatches/<slug>/*.json`, attempts the dispatch (call the configured skill via whatever mechanism is right — `gh issue create` for Tier-2 fallback, `claude -p` for in-process, or signal an external runner), and updates `webhook_deliveries.dispatch_status` via the same `updateDispatch()` helper.
   - `/operator deploy webhook-dispatch-sweep` agent that wraps the script and runs on cron via Yielde OS.

2. **Kernel `session.cost` integration.** Outside this repo — needs a `~/.claude/os/` change. When a session ends, append an audit event `{ event: "session.cost", session_id, tokens_in, tokens_out, cost_cents, model }` and shell out to `scripts/record-session-close.mjs`. Bridge's `syncSessionsFromAudit` already has the `session.cost` branch wired.

3. **Co-founder rollout.** Update `operator-bridge` skill: when `~/.claude/operator/` does not exist on the running machine (Devon/Lyell), fall back to opening a GitHub issue against `yielde-brain` with the operator request payload. Skill already documents this; needs the code path.

4. **Badge consolidation.** Replace the inline `Badge` clones in `webhook-tail-live.tsx`, run-nav, configure pages, etc. with a single `<Badge variant>` component.

### Hard rules (don't break)

Inherited from Phase 3 + extended for Phase 4:

- **Bridge reads-only from `yielde-bridge-config/`** — all registry writes go through `scripts/bridge.mjs`.
- **Webhook secrets resolved at request time** — never cached. Dispatcher must not see the secret either.
- **`better-sqlite3` is sync** — wrap reads in `force-dynamic`, wrap writes in single transactions.
- **No raw PII in `webhook_deliveries.body_blob`** — every PII-bearing slug MUST have a redaction rule configured before the integration is enabled.
- **Brain writes** still go through `brain-gatekeeper`'s `_inbox/` rules.
- **File-guard pattern** still blocks filenames containing `secrets` (plural). Singular only.
- **`lib/json-io.ts` is the single seam** for JSON reads. Audit/markdown/JSONL readers may stay direct since BOM only affects JSON.parse.
- **Next.js routing**: never use `_`-prefixed folders for routes — Next treats them as private and returns 405. The SSE route lives at `/api/webhook-stream/` for this reason.
- **React 19 purity**: server components and client renders must not call `Date.now()` (or other impure functions) at render time. Hoist to `useState`+`useEffect` with `setInterval`. Setting state synchronously inside the effect body trips `react-hooks/set-state-in-effect` — let the first tick land via the interval.

### Verification gate before Phase 5 commit

- `npx tsc --noEmit` clean.
- `npx eslint --max-warnings=0 lib/ components/ app/` clean.
- Queue file consumed by the sweeper → `dispatch_status` flips from `queued` to `succeeded` (or `failed` with a real error in `dispatch_log`).
- Real `session.cost` audit event lands → `sessions` table row has `cost_cents` populated → cost rollup non-zero.
- Co-founder fallback: simulate "no operator dir" → `operator-bridge` opens a GitHub issue with the request payload. (Smoke locally with `YIELDE_OPERATOR_DIR=/nonexistent`.)
- Brain draft in `_inbox/` describing what shipped, committed and pushed.

---

## Open follow-ups (not blockers)

1. **`parseFrontmatter` triplication** still — now quadruplicated since `brain-inbox.ts` re-exports from `lib/skills.ts`. Re-export is cheap, so this is fine, but consolidating to one source-of-truth helper would clean it up.
2. **`pinned` boolean parsing inconsistency.** Same status since Phase 1.
3. **Windows libuv shutdown assertion** in spawned Node scripts. Pattern in `app/api/skills/import-hermes/route.ts` — reuse for any Phase 5 dispatcher spawn.
4. **`/brain-log promote` outstanding for SIX drafts** (Chris-only action; agent must not promote):
   - `_inbox/2026-05-12-yielde-bridge-phase-0-kickoff.md` (decision)
   - `_inbox/2026-05-12-yielde-bridge-phase-0-complete.md` (staff-work)
   - `_inbox/2026-05-12-1326-yielde-bridge-phase-1-shipped.md` (staff-work)
   - `_inbox/2026-05-12-1556-yielde-bridge-phase-2-shipped.md` (staff-work)
   - `_inbox/2026-05-12-1644-yielde-bridge-phase-3-shipped.md` (staff-work)
   - `_inbox/2026-05-12-1530-yielde-bridge-phase-4-shipped.md` (staff-work)
5. **LF/CRLF noise** on every Windows commit. Cosmetic. `.gitattributes` `* text=auto eol=lf` would silence.
6. **`scripts/bridge.mjs` `DEFAULT_BODY` schema duplication.** Still safe at schema_version 1.0.
7. **`syncOperatorRuns()` + `syncSessionsFromAudit()` both run per render.** Both idempotent + fast; gate behind a `React cache()` or request-scoped singleton if growth becomes noticeable.
8. **Badge clones** — now 8+ across rooms. Phase 5 should consolidate.
9. **Cost rollup uses `sessions.started_at`** — `scripts/record-session-close.mjs` only writes `ended_at` if started_at isn't already set, so kernel-emitted rows backfill cleanly. But a manually-inserted close-only row (e.g. the seam smoke test) shows in the sessions table with no started_at and therefore doesn't appear in the rollup. Kernel must emit both events.

---

## Quick-reference paths

| What | Where |
|---|---|
| Bridge app | `C:\Users\chris\yielde-bridge\` (Next.js 16, `npm run dev` → :3030) |
| Skills repo (public, MIT) | `C:\Users\chris\yielde-skills\` |
| Config repo (private) | `C:\Users\chris\yielde-bridge-config\` — empty Phase 0 stubs at HEAD `fb05d0d` |
| Brain | `C:\Users\chris\yielde-brain\` — write `_inbox/` ONLY |
| Project memory | `~/.claude/projects/C--Users-chris/memory/project_yielde_bridge.md` |
| Yielde OS capabilities | `~/.claude/os/capabilities/registry.json` (36 caps, 2 hard-gated) |
| Yielde OS sessions (live) | `~/.claude/os/sessions.json` (UTF-8 BOM — readers must strip) |
| Yielde OS audit log | `~/.claude/os/audit.jsonl` (kernel writes, JSONL) |
| Operator runs | `~/.claude/operator/runs/<agent>/*.jsonl` |
| Junctions | `~/.claude/skills/{yielde,hermes}/` → `yielde-skills/skills/{yielde,hermes}/` |
| Telemetry sidecar | `~/.claude/skills/.usage.json` |
| Runtime DB | `~/.claude/bridge/runtime/runtime.db` (`YIELDE_BRIDGE_RUNTIME_DB` override) |
| Dispatch queue | `~/.claude/bridge/dispatches/<slug>/<run-id>.json` (`YIELDE_BRIDGE_DISPATCH_QUEUE` override) |

## `bridge` CLI cheatsheet

```bash
node scripts/bridge.mjs sync                              # git pull --rebase --autostash the config repo
node scripts/bridge.mjs list mcp|api|webhook|secret-ref   # pretty-print the JSON

node scripts/bridge.mjs add mcp <name> --transport stdio|sse|http [--command CMD] [--url URL] [--env-ref REF ...]
node scripts/bridge.mjs add api <name> --base-url URL --auth-ref REF [--auth bearer|api-key|oauth|basic|none] [--rpm N]
node scripts/bridge.mjs add webhook <slug> --target-skill SKILL --secret-ref REF [--verify hmac-sha256|none]
                                                                                 [--retention N]
                                                                                 [--redact-key KEY ...] [--redact-pattern REGEX ...]
node scripts/bridge.mjs add webhook-out <name> --url URL [--auth-ref REF] [--max-attempts N]
node scripts/bridge.mjs add secret-ref <name> --provider infisical|os-keychain|env|gh-secret --path PATH

node scripts/bridge.mjs remove mcp|api|webhook|secret-ref <name>
```

## Runtime DB probes

```bash
# Inspect runtime.db (schema, row counts, recent rows)
node scripts/probe-runtime.mjs

# Inspect the most-recent webhook delivery row (dispatch + redaction state)
node scripts/probe-stored.mjs

# Tail the SSE stream for N ms
node scripts/probe-stream.mjs http://localhost:3030/api/webhook-stream?seed=5 6000

# End-to-end webhook + dispatch + redaction smoke
node scripts/bridge.mjs add secret-ref smoke-webhook-secret --provider env --path SMOKE_WEBHOOK_SECRET
node scripts/bridge.mjs add webhook smoke-test --target-skill noop --secret-ref smoke-webhook-secret \
  --retention 50 --redact-key apiKey --redact-pattern 'tok_[A-Za-z0-9]+'
SMOKE_WEBHOOK_SECRET=phase4-test-secret npm run dev   # in another shell
node scripts/smoke-webhook.mjs
# Expect: 202 (signed) / 401 (tampered) / 401 (no-sig) / 404 (unknown slug)
node scripts/probe-stored.mjs                          # dispatch_status=succeeded, redaction_applied=1
node scripts/bridge.mjs remove webhook smoke-test
node scripts/bridge.mjs remove secret-ref smoke-webhook-secret

# Kernel seam (PowerShell-callable)
node scripts/record-session-close.mjs --id <session_id> --ended-at <ISO> --model <name> \
  --tokens-in N --tokens-out N --cost-cents N --role <name> --intent "..."
```

---

## Phase 5+ on the radar

- **Phase 5 — Queue worker + kernel cost + co-founder rollout.** Sweep `~/.claude/bridge/dispatches/`; update `dispatch_status`. Kernel emits `session.cost` events; cost rollup activates. `operator-bridge` Tier-2 (Devon/Lyell) GitHub-issue fallback wired.
- **Phase 6 — Innovation tier.** Skill provenance graph, eval harness, curator with Chris-approve, bulk Hermes import. Badge consolidation as part of this pass.

---

## Appendix: standards encoded in this handoff

Anything below this line is enforcement-grade — the resume prompt and Phase 5 verification gate must keep these intact, since they were earned the hard way over Phases 0–4:

1. **Two trust roots only.** Repo-local sessions stay in `yielde-bridge` + `yielde-bridge-config`. The full Yielde brain index loads only when a request touches `yielde-platform`, `yielde-site`, a client slug, or co-founder work.
2. **Three repos, three roles.** `yielde-skills` (public, MIT, content). `yielde-bridge` (public, UI + runtime). `yielde-bridge-config` (private, registry). Never blur the lines.
3. **Bridge writes through two surfaces only.** Registry mutations via `scripts/bridge.mjs` + git. Runtime state via `lib/runtime.ts` → `~/.claude/bridge/runtime/runtime.db` and the dispatch queue at `~/.claude/bridge/dispatches/`. Server routes never touch `yielde-bridge-config/`.
4. **`lib/json-io.ts` is the single seam for JSON reads.** PowerShell-written files have a BOM. `readJsonOrDefault` and `readJsonStrict` strip it. Raw `readFile + JSON.parse` is forbidden under `lib/` for JSON files. Markdown/JSONL/text readers may stay direct.
5. **Webhook secrets resolved per request, never cached.** `lib/secret-resolver.ts` is the only seam. Dispatcher does not see the secret.
6. **File-guard pattern blocks `secrets` (plural).** Singular only: `secret-resolver.ts`, `secret-refs.json`, etc.
7. **`force-dynamic` on every server page that reads state.** Filesystem and `runtime.db` change between requests.
8. **HTTP 200 ≠ feature working.** Verification gates need content assertions, not status-code-only checks.
9. **Brain protocol: `_inbox/` only.** Drafts via `brain-gatekeeper` schema. `/brain-log promote` is Chris-only; agents must never promote.
10. **Never silent.** Every significant change → a brain draft. Every brain draft → committed and pushed.
11. **React 19 + Next 16 quirks:** server components can be lint-flagged for impure calls during render (`Date.now()`, etc.). Use SQL-side computation or hoist purity-violating calls to non-rendered helpers. In client components, hold `now` in `useState`+`useEffect`+`setInterval`. Do NOT setState synchronously inside the effect body — let the first interval tick land.
12. **`better-sqlite3` is sync.** Wrap reads inside `force-dynamic` pages. Wrap writes in single transactions.
13. **Redaction before persistence.** No raw PII in `webhook_deliveries.body_blob`. Every PII-bearing slug must declare redaction rules at `bridge add webhook` time before the integration goes live.
14. **Schema migrations are idempotent.** Use `PRAGMA table_info(<table>)` to check before `ALTER TABLE ADD COLUMN`. Existing rows survive — they get NULL for new columns until rewritten.
15. **Next.js route file names.** Folders prefixed `_` are private (returns 405). The SSE endpoint at `/api/webhook-stream/` deliberately avoids `/api/webhooks/_stream/`. Keep routes flat or use non-underscore names.

If any future change weakens one of these, propose an explicit ADR-style entry in a brain draft before shipping.
