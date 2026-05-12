# Yielde Bridge — handoff (post Phase 3)

Last session: 2026-05-12, ended after Phase 3 ship + UTF-8-BOM bugfix in `lib/sessions.ts` / `lib/config.ts`. Next session picks up Phase 4 (Inspect room + real skill dispatch + redaction/retention on archived webhook bodies).

Repo HEADs at handoff:

| Repo | HEAD | Branch |
|---|---|---|
| `yielde-bridge` | _next commit (this session's Phase 3 ship)_ | `main` |
| `yielde-bridge-config` | `fb05d0d` (smoke fixture round-trip, net-zero diff vs `cef0d72`) | `main` |
| `yielde-brain` | `06c7210` (Phase 3 draft, awaiting `/brain-log promote`) | `master` |

---

## Handoff prompt (paste into a fresh Claude Code session)

> Resume Yielde Bridge Phase 4.
>
> 1. Read `~/.claude/projects/C--Users-chris/memory/project_yielde_bridge.md` — Phase 0–3 ✅. Run all 9 "Verification on session resume" checks in that file before touching code.
> 2. Read `C:\Users\chris\yielde-bridge\HANDOFF.md` (this file) for the Phase 4 plan, open follow-ups, and smoke tests.
> 3. Read `C:\Users\chris\yielde-bridge\AGENTS.md` — Next.js 16 / Turbopack / React 19 quirks plus the load-bearing **rule #3** (Bridge writes via `runtime.db`, never to `yielde-bridge-config/` from server routes).
> 4. **Do NOT load `~/.claude/CLAUDE.md`'s full brain index unless a task explicitly touches `yielde-platform`, `yielde-site`, a client slug, or co-founder work.** Brain writes still go through `brain-gatekeeper`'s `_inbox/` rules — never edit canonical paths.
> 5. Start Phase 4: Inspect room (audit search, `_inbox/` diff+promote, capability decisions, skill traces), real skill dispatch from webhook receiver (turn `target_skill` from logged intent into a real invocation), redaction + retention sweep on `webhook_deliveries.body_blob`, SSE-based real-time tail.
> 6. At meaningful milestones, write a draft to `yielde-brain/_inbox/YYYY-MM-DD-HHMM-<slug>.md` per the `brain-gatekeeper` schema, commit, and push.
>
> Work without stopping to ask clarifying questions when the reasonable call is obvious.

---

## What shipped (Phase 3)

| Repo | Commits | Highlights |
|---|---|---|
| `yielde-bridge` | `72e9f58` → _this commit_ | Run room (5 panels) + SQLite runtime + HMAC webhook receiver + BOM bugfix |
| `yielde-bridge-config` | `cef0d72` → `fb05d0d` | smoke fixture round-trip — 4 commits, net-zero |
| `yielde-brain` | `06c7210` | `_inbox/2026-05-12-1644-yielde-bridge-phase-3-shipped.md` |

**Files in `yielde-bridge` that landed this phase:**

- `lib/runtime.ts` — `better-sqlite3` wrapper. WAL, foreign keys on, schema init on first read. Three tables: `webhook_deliveries` (slug, payload_hash, status, http_code, reason, body_blob), `operator_runs` (agent, run_id, started/finished, status, exit, cost_cents, tokens), `sessions` (placeholder for future kernel writes). Per-slug retention prune (last 100) on every webhook insert. `listDailyCostBuckets(days)` uses a recursive-CTE date sequence so the cost page never calls `Date.now()` in render (React 19 `react-hooks/purity` rule).
- `lib/operator-runs.ts` — idempotent sync of `~/.claude/operator/runs/<agent>/*.jsonl` into `operator_runs` via UPSERT on `(agent, run_id)`. Tolerates partial JSONL.
- `lib/sessions.ts` — read-only view of `~/.claude/os/sessions.json`, active-first.
- `lib/secret-resolver.ts` — per-request resolution; `env` only this phase, other providers throw typed `SecretResolveError` for clean 503s.
- `app/run/{layout,page,sessions,operator,webhook-tail,cost}/*.tsx` — 5 real panels replacing `PhasePlaceholder`. `force-dynamic` everywhere.
- `components/run-nav.tsx` (async server) + `components/run-nav-links.tsx` (client child with `usePathname`) — same split as Phase 2's `ConfigureNav`.
- `app/api/webhooks/[slug]/route.ts` — HMAC-SHA256 receiver with `timingSafeEqual`. Accepts `x-signature`, `x-hub-signature-256`, or `x-yielde-signature`; strips `sha256=` prefix. Persists every delivery (accepted **and** rejected) to `webhook_deliveries`.
- `scripts/probe-runtime.mjs` — diagnostic; prints table list + row counts + recent operator runs and deliveries.
- `scripts/smoke-webhook.mjs` — end-to-end smoke; signed accept, tampered reject, no-sig reject, unknown-slug reject. Reads `SMOKE_WEBHOOK_SECRET` from env.
- `lib/sessions.ts` + `lib/config.ts` — UTF-8 BOM strip before `JSON.parse`. PowerShell-written files (incl. `~/.claude/os/sessions.json`) carry a BOM that vanilla `JSON.parse` rejects. Applied defensively to both readers since registries could land BOM'd too.

---

## Phase 4 plan (Inspect room + dispatch + redaction)

### Files to land (`yielde-bridge`)

1. **Real skill dispatch on accepted webhook** (`app/api/webhooks/[slug]/route.ts`).
   - Today: accepted delivery returns 202 + logs dispatch intent in `webhook_deliveries.reason`.
   - Phase 4: invoke the configured `targetSkill`. Two viable surfaces: shell out to a CLI runner (`operator-bridge` skill via `/operator deploy`), or in-process Node import of a SKILL.md handler. Probably start with `operator-bridge` for parity with Tier 2 Devon/Lyell routing.
   - Add `dispatched` table or `dispatch_status` column to `webhook_deliveries` so retries are tracked.

2. **Redaction + retention sweep** (`lib/runtime.ts`).
   - Today: raw bodies persist forever subject only to the 100-per-slug cap.
   - Phase 4: optional per-slug redaction map (regex/JSON-path) before storing. Retention sweep job that respects per-slug TTL.
   - **Before any real PII can land.** Today's smoke payloads are synthetic.

3. **Inspect room** (`app/inspect/{audit-search,brain-inbox,capability-decisions,skill-traces}/page.tsx`).
   - Audit search over `~/.claude/os/audit.jsonl` (kernel writes).
   - `yielde-brain/_inbox/*.md` diff + promote — UI calls into `brain-gatekeeper`'s promote flow; never touches canonical paths.
   - Capability decision log over `~/.claude/os/proposals/`.
   - Skill traces — pull from telemetry sidecar.

4. **Real-time webhook tail** (`app/run/webhook-tail`).
   - Today: `force-dynamic` server polling.
   - Phase 4: SSE endpoint at `/api/webhooks/_stream`; client subscribes and prepends rows live.

5. **Kernel-side cost backfill** (`sessions` table).
   - Today: empty.
   - Phase 4: Yielde OS kernel writes a row per session close with token/cost totals. Cost page stops being decorative.

### Hard rules (don't break)

- **Bridge reads-only from `yielde-bridge-config/`** — all registry writes still go through `scripts/bridge.mjs`.
- **Webhook secrets resolved at request time** — never cache beyond the single request. `secret-refs.json` only names the path.
- **`better-sqlite3` is sync** — wrap reads in `force-dynamic` pages, wrap writes in single transactions.
- **No raw PII in `webhook_deliveries.body_blob` without a retention plan** — Phase 4 must land redaction before any real-world signed webhook integration goes live.
- **Brain writes** still go through `brain-gatekeeper`'s `_inbox/` rules.
- **File-guard pattern** still blocks filenames containing `secrets` (plural). Use singular `secret-resolver.ts`, `secret-refs.json`, etc.
- **UTF-8 BOM strip in JSON readers** — centralized in `lib/json-io.ts`. Use `readJsonOrDefault(path, fallback)` for silent-fallback reads or `readJsonStrict(path)` for throwing reads. New `lib/` JSON readers MUST go through one of these helpers; do not re-implement `readFile + JSON.parse` directly.

### Verification gate before Phase 4 commit

- `npx tsc --noEmit` clean
- `npx eslint --max-warnings=0 lib/ components/ app/` clean
- `/inspect/*` all render real data, not `PhasePlaceholder`
- POST a signed payload — `webhook_deliveries.dispatch_status` reflects the actual skill run (success or failure), not just "intent: <name>"
- Redaction map applied before `body_blob` write for a slug that has one configured
- Real-time tail emits SSE event within < 1s of an accepted delivery
- New brain draft in `_inbox/` describing what shipped, committed and pushed

---

## Open follow-ups (not blockers)

1. **`parseFrontmatter` triplication.** Still 3 copies (`lib/skills.ts` TS, `yielde-skills/scripts/build-index.mjs`, `yielde-skills/scripts/import-hermes.mjs`). Phase 3 didn't add a 4th caller. Extract when a 4th YAML caller appears.

2. **`pinned` boolean parsing inconsistency.** Same status since Phase 1.

3. **Windows libuv shutdown assertion.** Encoded in `app/api/skills/import-hermes/route.ts`. Reapply the `result.code === N || stderr-substring-match` pattern to any Phase 4 endpoint that spawns Node scripts (likely the dispatcher).

4. **`/brain-log promote` outstanding for five drafts** (Chris-only action; agent must not promote):
   - `_inbox/2026-05-12-yielde-bridge-phase-0-kickoff.md` (decision)
   - `_inbox/2026-05-12-yielde-bridge-phase-0-complete.md` (staff-work)
   - `_inbox/2026-05-12-1326-yielde-bridge-phase-1-shipped.md` (staff-work)
   - `_inbox/2026-05-12-1556-yielde-bridge-phase-2-shipped.md` (staff-work)
   - `_inbox/2026-05-12-1644-yielde-bridge-phase-3-shipped.md` (staff-work)

5. **LF/CRLF noise.** Every Windows commit warns. Cosmetic. `.gitattributes` with `* text=auto eol=lf` in all three repos would silence it.

6. **`scripts/bridge.mjs` `DEFAULT_BODY` schema duplication.** Still safe at schema_version 1.0.

7. **`syncOperatorRuns()` is called twice per render** (`RunNav` + page-level). Idempotent + fast (~9 files), but if `~/.claude/operator/runs/` grows past hundreds of agents, gate behind a React `cache()` or a request-scoped singleton.

8. **`sessions/page.tsx` `relative()` calls `Date.now()` during render.** Lint accepted it (lives in a module-level helper) but it's the same impurity the cost page got flagged for. Acceptable on a `force-dynamic` server page; revisit if React 19's purity rule tightens.

9. **Inline badge components (TransportBadge, AuthBadge, VerifyBadge, ProviderBadge, GateBadge, RunStatusBadge, SessionRoleBadge, …).** Now 7+ near-clones. Consolidation to a generic `<Badge variant>` is starting to make sense — pull the trigger in Phase 4.

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
| Yielde OS sessions | `~/.claude/os/sessions.json` (UTF-8 BOM — readers must strip) |
| Operator runs | `~/.claude/operator/runs/<agent>/*.jsonl` |
| Junctions | `~/.claude/skills/{yielde,hermes}/` → `yielde-skills/skills/{yielde,hermes}/` |
| Telemetry sidecar | `~/.claude/skills/.usage.json` |
| Runtime DB | `~/.claude/bridge/runtime/runtime.db` (`YIELDE_BRIDGE_RUNTIME_DB` override) |

## `bridge` CLI cheatsheet

```bash
node scripts/bridge.mjs sync                              # git pull --rebase --autostash the config repo
node scripts/bridge.mjs list mcp|api|webhook|secret-ref   # pretty-print the JSON

node scripts/bridge.mjs add mcp <name> --transport stdio|sse|http [--command CMD] [--url URL] [--env-ref REF ...]
node scripts/bridge.mjs add api <name> --base-url URL --auth-ref REF [--auth bearer|api-key|oauth|basic|none] [--rpm N]
node scripts/bridge.mjs add webhook <slug> --target-skill SKILL --secret-ref REF [--verify hmac-sha256|none]
node scripts/bridge.mjs add webhook-out <name> --url URL [--auth-ref REF] [--max-attempts N]
node scripts/bridge.mjs add secret-ref <name> --provider infisical|os-keychain|env|gh-secret --path PATH

node scripts/bridge.mjs remove mcp|api|webhook|secret-ref <name>
```

## Runtime DB probes

```bash
# Inspect runtime.db (schema, row counts, recent rows)
node scripts/probe-runtime.mjs

# End-to-end webhook smoke (add fixture first via bridge CLI, then export the env)
node scripts/bridge.mjs add secret-ref smoke-webhook-secret --provider env --path SMOKE_WEBHOOK_SECRET
node scripts/bridge.mjs add webhook smoke-test --target-skill noop --secret-ref smoke-webhook-secret
SMOKE_WEBHOOK_SECRET=phase3-test-secret npm run dev   # in another shell
node scripts/smoke-webhook.mjs
# Expect: 202 (signed) / 401 (tampered) / 401 (no-sig) / 404 (unknown slug)
node scripts/bridge.mjs remove webhook smoke-test
node scripts/bridge.mjs remove secret-ref smoke-webhook-secret
```

---

## Phase 5+ on the radar (for context only — do not start)

- **Phase 5 — Co-founder rollout.** Node-only CLI fallback for Devon/Lyell, GitHub-issue handoff skill for capability escalation.
- **Phase 6 — Innovation tier.** Skill provenance graph, eval harness, curator with Chris-approve, bulk Hermes import.
