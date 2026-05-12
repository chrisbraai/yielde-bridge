# Yielde Bridge — handoff (post Phase 5)

Last session: 2026-05-12, ended after Phase 5 ship (queue worker + kernel `session.cost` producer + co-founder Tier-2 fallback + badge consolidation). Next session picks up Phase 6 (real cron executor for `webhook-dispatch-sweep`, skill provenance graph, eval harness, pricing JSON extraction, promote the seven brain drafts).

Repo HEADs at handoff:

| Repo | HEAD | Branch |
|---|---|---|
| `yielde-bridge` | `1dfca58` | `main` |
| `yielde-bridge-config` | `fb05d0d` (content-identical descendants after smoke churn are acceptable) | `main` |
| `yielde-skills` | `71d0556` | `main` |
| `yielde-brain` | `05d66f0` (Phase 5 draft in `_inbox/`, awaiting `/brain-log promote`) | `master` |

---

## Handoff prompt (paste into a fresh Claude Code session)

> Resume Yielde Bridge Phase 6.
>
> 1. Read `~/.claude/projects/C--Users-chris/memory/project_yielde_bridge.md` — Phase 0–5 ✅. Run all 14 "Verification on session resume" checks in that file before touching code. Each check carries a content assertion. Confirm `yielde-bridge` HEAD is `1dfca58` (or descendant), `yielde-bridge-config` HEAD content-identical to `fb05d0d`, `yielde-skills` HEAD is `71d0556` (or descendant), `yielde-brain` HEAD is `05d66f0` (or descendant).
> 2. Read `C:\Users\chris\yielde-bridge\HANDOFF.md` (this file) for the Phase 6 plan, hard rules, open follow-ups, and smoke tests.
> 3. Read `C:\Users\chris\yielde-bridge\AGENTS.md` — Next.js 16 / Turbopack / React 19 quirks plus the load-bearing **rule #3** (Bridge writes via `runtime.db` + dispatch queue, never to `yielde-bridge-config/` from server routes).
> 4. **Do NOT load `~/.claude/CLAUDE.md`'s full brain index unless a task explicitly touches `yielde-platform`, `yielde-site`, a client slug, or co-founder work.** Brain writes still go through `brain-gatekeeper`'s `_inbox/` rules — never edit canonical paths.
> 5. **Hard rules to preserve** (full list in HANDOFF.md § Hard rules — all 15 enforcement-grade items):
>    - Bridge reads-only from `yielde-bridge-config/`; all writes go through `scripts/bridge.mjs` (registry) or `lib/runtime.ts` + `lib/dispatcher.ts` (runtime).
>    - All `lib/` JSON readers MUST go through `lib/json-io.ts`. Raw `readFile + JSON.parse` is forbidden under `lib/`. CLI scripts (under `scripts/`) inline their own `stripBom` because `lib/json-io.ts` is `server-only`.
>    - Webhook secrets resolved per request via `lib/secret-resolver.ts`; never cached. Dispatcher and sweeper must not see the secret either.
>    - File-guard pattern blocks `secrets` (plural). Use singular.
>    - HTTP 200 ≠ feature working. Verification gates need content assertions.
>    - Next.js routes: avoid `_underscore` parent folders — they return 405. `Date.now()` in client component render is a `react-hooks/purity` error.
>    - Badges: use `components/badge.tsx` (`<Badge variant=… size=…>`); no new inline `inline-block px-2 py-0.5 rounded border font-mono` pills.
> 6. Start Phase 6 work:
>    - **`runtimes/cron.ps1` adapter for `/operator`.** Currently `~/.claude/operator/agents/webhook-dispatch-sweep.md` is registered with `runtime: cron` but the cron adapter doesn't exist on disk, so `/operator deploy webhook-dispatch-sweep` can't actually run the sweeper. Sweeper itself is fully functional via `node C:\Users\chris\yielde-bridge\scripts\sweep-dispatches.mjs --mode operator-deploy`. Phase 6 lands the adapter so the agent registry is the source of truth.
>    - **Sweeper executor.** `operator-deploy` mode currently records `dispatch.intent` JSONL without actually invoking `/operator deploy <target>`. Wire real invocation (likely `claude -p "/operator deploy <target> --key=value"` with cost guardrails) so the queued deliveries actually run.
>    - **Pricing JSON extraction.** `scripts/emit-session-cost.mjs` has a 6-row `PRICING_CENTS_PER_MILLION` table hand-maintained inline. Move to `~/.claude/bridge/cli/pricing.json` so the future model-router skill can share the source.
>    - **Skill provenance graph + eval harness + curator** (innovation tier).
>    - **Promote the 7 brain drafts** in `_inbox/` (Chris-only `/brain-log promote`).
> 7. At meaningful milestones, write a draft to `yielde-brain/_inbox/YYYY-MM-DD-HHMM-<slug>.md` per the `brain-gatekeeper` schema, commit, and push. Never silent, never canonical.
>
> Work without stopping to ask clarifying questions when the reasonable call is obvious. Use TaskCreate to track multi-step work.

---

## What shipped (Phase 5)

| Repo | Commits | Highlights |
|---|---|---|
| `yielde-bridge` | `28e5f87 → 1dfca58` | `scripts/sweep-dispatches.mjs` (queue worker, 3 modes: dry-run / operator-deploy / github-issue) · `scripts/emit-session-cost.mjs` (kernel seam: transcript JSONL → audit + DB upsert) · `components/badge.tsx` (6 variants × 2 sizes; 11 inline pill clones migrated, net -91 lines) |
| `yielde-skills` | `5abadbe → 71d0556` | `scripts/operator-bridge-dispatch.mjs` (Tier-1 records dispatch.intent JSONL; Tier-2 opens labelled GitHub issue) · `skills/yielde/operator-bridge/SKILL.md` refactored to delegate to the new CLI |
| `yielde-brain` | `1e3c646 → 05d66f0` | `_inbox/2026-05-12-1730-yielde-bridge-phase-5-shipped.md` |
| Outside-repo | n/a | `~/.claude/hooks/yielde-os-session-stop.ps1` (fire-and-forget invocation of `emit-session-cost.mjs` after `session.stopped`) · `~/.claude/operator/agents/webhook-dispatch-sweep.md` (cron-runtime manifest, `*/5 * * * *`) · `~/.claude/bridge/cli/` (Windows directory junction → `yielde-bridge/scripts/`, stable kernel path) |

**Earlier phases** (still referenced for verification gates):
- Phase 4: Inspect room + real dispatch (`dispatcher.ts`) + redaction (`redaction.ts`) + 6-column `webhook_deliveries` migration + per-slug retention + SSE tail at `/api/webhook-stream` + `webhook-tail-live.tsx` + session-sync seam (`scripts/record-session-close.mjs`). Detail in the brain draft `_inbox/2026-05-12-1530-yielde-bridge-phase-4-shipped.md`.

**Files in `yielde-bridge` that landed this phase:**

- **`lib/audit.ts`** — typed reader over `~/.claude/os/audit.jsonl`. `listAuditEvents({q, event, sessionId, limit})` walks newest→oldest, applies filters. `auditEventCounts()` aggregates. No JSON files involved (JSONL), so no BOM concern.
- **`lib/brain-inbox.ts`** — read-only `~/yielde-brain/_inbox/*.md` reader. Parses YAML frontmatter via `parseFrontmatter` (re-export from `lib/skills.ts`). Lists drafts newest-first. Never writes; promotion stays `/brain-log promote`-only.
- **`lib/redaction.ts`** — JSON-aware key rule + regex rule. Tries JSON parse first; falls back to raw regex over utf-8 if parse fails. Returns `{ body, applied, notes }` for traceability.
- **`lib/dispatcher.ts`** — `dispatchAcceptedDelivery({ deliveryId, slug, targetSkill, … })`. `noop` short-circuits to `succeeded`; everything else writes a JSON queue file. Failures land as `dispatch_status=failed` with the error in `dispatch_log`.
- **`lib/session-sync.ts`** — reads `audit.jsonl`, upserts `session.started`/`intent.set`/`session.stopped`/`session.cost` events into the `sessions` table. The `session.cost` branch is the long-term consumer; Phase 4 only fills the first three.
- **`lib/runtime.ts` migration** — idempotent: `PRAGMA table_info(webhook_deliveries)` check, then `ALTER TABLE ADD COLUMN` for `dispatch_status`/`dispatch_target`/`dispatch_run_id`/`dispatched_at`/`dispatch_log`/`redaction_applied`. New `WebhookDelivery` shape exposes them. Added `updateDispatch()`, `listWebhookDeliveriesSince()`, `maxWebhookDeliveryId()`, `upsertSession()`, `setRetentionLimits()`. Insert-time retention prune honours per-slug overrides via `pruneSlugRetention` + `keepCountForSlug`.
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

## Phase 6 plan (real cron executor + pricing extraction + innovation tier)

### Files to land

1. **`runtimes/cron.ps1` adapter for `/operator`.** Phase 5 registered `~/.claude/operator/agents/webhook-dispatch-sweep.md` with `runtime: cron`, but the adapter doesn't exist on disk — so `/operator deploy webhook-dispatch-sweep` cannot actually invoke the sweeper. The sweeper itself works fine via direct `node scripts/sweep-dispatches.mjs --mode operator-deploy`. Phase 6 closes the loop: cron adapter triggers the script on schedule, captures stdout into the standard `~/.claude/operator/runs/webhook-dispatch-sweep/<run-id>.jsonl` location.

2. **Sweeper executor.** `operator-deploy` mode currently records `dispatch.intent` + `dispatch.queued` JSONL without actually invoking `/operator deploy <target>`. Wire real invocation (likely `claude -p` with cost guardrails) so a queued delivery actually runs the configured agent. Until then, Phase 5's mode is a faithful audit trail but not an execution.

3. **Pricing JSON extraction.** `scripts/emit-session-cost.mjs` has a 6-row `PRICING_CENTS_PER_MILLION` table hand-maintained inline. Move to `~/.claude/bridge/cli/pricing.json` (single source of truth shared with the future model-router skill).

4. **Innovation tier.** Skill provenance graph (cross-reference `related_skills` frontmatter into a clickable Inspect view), eval harness for skills (Hermes-imported and yielde-native), curator with Chris-approve flow for promoting Hermes drafts.

5. **Brain draft promote queue.** Seven drafts now awaiting `/brain-log promote` (Chris-only). Phase 6 should not ship new drafts until the queue drains.

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

### Verification gate before Phase 6 commit

- `npx tsc --noEmit` clean.
- `npx eslint --max-warnings=0 lib/ components/ app/` clean.
- `/operator deploy webhook-dispatch-sweep` actually invokes the sweeper script via the new cron adapter (not just records intent).
- A queued delivery flips `queued → succeeded` AND the configured `dispatch_target` is observably invoked end-to-end (e.g. `deploy-yielde-site` agent run produces a real `~/.claude/operator/runs/deploy-yielde-site/<run-id>.jsonl` with `operator.run.end`).
- Pricing table moved to `~/.claude/bridge/cli/pricing.json`; `emit-session-cost.mjs` reads from it.
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

## Phase 6+ on the radar

- **Phase 6 — Real cron executor + pricing extraction + innovation tier.** `runtimes/cron.ps1` so `/operator deploy webhook-dispatch-sweep` runs the sweeper on schedule. Sweeper actually invokes `/operator deploy <target>` instead of just recording intent. Pricing table extracted to `~/.claude/bridge/cli/pricing.json`. Skill provenance graph, eval harness, curator with Chris-approve.
- **Phase 7+ — Open.** Bulk Hermes import. Multi-machine sync (Devon/Lyell operator state replication). External webhook outbound (we have inbound + dispatch; outbound is half-stubbed in `webhook-out` registry).

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

16. **Badges go through `components/badge.tsx`.** Six variants (`success | warn | danger | info | accent | muted`), two sizes (`md | sm`). No new inline `inline-block px-2 py-0.5 rounded border font-mono` pills. Domain-specific wrappers (TransportBadge, KindBadge, etc.) thinly map a value space to a variant and delegate. The connection-state pill in `webhook-tail-live.tsx` is the only deliberate exception (it carries a pulsing colored dot).

17. **CLI scripts in `scripts/` cannot import `lib/*`.** Server-only modules are excluded from Node CLI contexts. CLIs inline their own `stripBom` and SQL helpers; this is the precedent set by `record-session-close.mjs`, `emit-session-cost.mjs`, and `sweep-dispatches.mjs`. When a 5th CLI lands, consolidate to a non-server-only `lib/io-utils.mjs`.

If any future change weakens one of these, propose an explicit ADR-style entry in a brain draft before shipping.
