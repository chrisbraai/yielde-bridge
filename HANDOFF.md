# Yielde Bridge — handoff (post Phase 2, self-review applied)

Last session: 2026-05-12, ended after Phase 2 ship + self-review pass. Next session picks up Phase 3 (Run room: live sessions, operator runs, webhook tail, cost meter — Bridge's first state-writing surface).

Repo HEADs at handoff:

| Repo | HEAD | Branch |
|---|---|---|
| `yielde-bridge` | `c0eeb9a` | `main` |
| `yielde-bridge-config` | `cef0d72` (Phase 0 empty stubs, fixture round-trip net-zero) | `main` |
| `yielde-brain` | `aafcebb` | `master` |

---

## Handoff prompt (paste into a fresh Claude Code session)

> Resume Yielde Bridge Phase 3.
>
> 1. Read `~/.claude/projects/C--Users-chris/memory/project_yielde_bridge.md` — Phase 0 ✅, Phase 1 ✅, Phase 2 ✅ (registries + Configure panels + `bridge` CLI + wired nav counts, 2026-05-12, HEAD `c0eeb9a`). Run all 6 "Verification on session resume" checks in that file before touching code.
> 2. Read `C:\Users\chris\yielde-bridge\HANDOFF.md` (this file) for the Phase 3 plan, open follow-ups, and smoke tests.
> 3. Read `C:\Users\chris\yielde-bridge\AGENTS.md` — the Next.js 16 / Turbopack / React 19 quirks plus the load-bearing **rule #3**: Phase 3 is the first phase where Bridge writes state. SQLite for the webhook archive at `~/.claude/bridge/runtime/`.
> 4. **Do NOT load `~/.claude/CLAUDE.md`'s full brain index unless a task explicitly touches `yielde-platform`, `yielde-site`, a client slug, or co-founder work.** This session is repo-local to `yielde-bridge` and `yielde-bridge-config`. Brain writes still go through `brain-gatekeeper`'s `_inbox/` rules — never edit canonical paths (`Decisions/`, `Incidents/`, `Staff/`, `Clients/`, `SOPs/`, `Platform/`, `Site/`, `Glossary.md`, `Backlog.md`, `INDEX.md`, `Alignment.excalidraw.md`).
> 5. Start Phase 3: `lib/runtime.ts` SQLite wrapper, `app/run/{sessions,operator,webhook-tail,cost}/page.tsx` real panels, `app/api/webhooks/[slug]/route.ts` inbound receiver with HMAC verify. See Phase 3 plan below.
> 6. At meaningful milestones, write a draft to `yielde-brain/_inbox/YYYY-MM-DD-HHMM-<slug>.md` per the `brain-gatekeeper` schema, commit, and push. Never silent. Never canonical.
>
> Work without stopping to ask clarifying questions when the reasonable call is obvious. Use TaskCreate to track multi-step work.

---

## What shipped (Phase 2, including self-review pass)

| Repo | Commits | Highlights |
|---|---|---|
| `yielde-bridge` | `c6bf4d6` → `e92440a` → `c0eeb9a` | Phase 2 core + HANDOFF + self-review (nav counts wired, README updated) |
| `yielde-bridge-config` | `a772acc` → `cef0d72` | 8 commits across fixture round-trip — net zero, HEAD back at empty Phase 0 stubs |
| `yielde-brain` | `aafcebb` | `_inbox/2026-05-12-1556-yielde-bridge-phase-2-shipped.md` (awaiting `/brain-log promote`) |

**Files in `yielde-bridge` that landed this phase:**

- `lib/config.ts` — server-only reader for `yielde-bridge-config/*.json` + capabilities mirror from `~/.claude/os/capabilities/registry.json`. Exports `listMcpServers`, `listApiConnectors`, `listWebhooks`, `listSecretRefs`, `listCapabilities`, `registryCounts`.
- `app/configure/{mcp,api,webhooks,secret-refs,capabilities}/page.tsx` — 5 real tables, all `force-dynamic`.
- `components/registry-{empty,header}.tsx` — shared shell pieces matching the `/configure/skills` visual language.
- `components/configure-nav.tsx` — refactored to **async server component** fetching `registryCounts()` + `listSkills()`. Counts pass as props to:
- `components/configure-nav-links.tsx` — new **client child** owning `usePathname()` and active-link styling.
- `app/configure/layout.tsx` — now async + `force-dynamic` so the nav re-counts on every render.
- `scripts/bridge.mjs` — Node CLI with `sync`/`list`/`add`/`remove`. Subcommands cover MCP, API, webhook (inbound + outbound), secret-ref. Regex-based secret-leak guard: literal `sk-…`, `ghp_…`, `xox[bp]-…`, `AIza…`, JWT-shape tokens trip an `exit 2` before disk write. Wired as `bin.bridge` + `npm run bridge`.
- `README.md` — refreshed to Phase 2; HANDOFF.md remains the canonical session-resume document.

---

## Phase 3 plan (Run room + SQLite runtime)

**Invariant change:** Phase 3 is the first phase where Bridge **writes** runtime state. The registry repo (`yielde-bridge-config/`) is still read-only from server routes — all registry mutations stay funneled through `scripts/bridge.mjs` + git. Phase 3 adds a separate **runtime layer** at `~/.claude/bridge/runtime/` (SQLite). Keep these two distinguished: registry = source-of-truth in git, runtime = local cache + audit + replay.

### Files to land (`yielde-bridge`)

1. **`lib/runtime.ts`** — SQLite wrapper using `better-sqlite3` (sync API, plays well on Windows, no native rebuild dance for our scale).
   - Init schema on first read. Single-file DB at `~/.claude/bridge/runtime/runtime.db` (override via `YIELDE_BRIDGE_RUNTIME_DB` env).
   - Tables:
     - `webhook_deliveries(id, slug, received_at, source_ip, payload_hash, status, http_code, body_blob)` — retention via trigger or scheduled prune (keep last 100 per slug).
     - `operator_runs(id, agent, started_at, finished_at, exit_code, cost_cents, tokens_in, tokens_out)`.
     - `sessions(id, harness, started_at, ended_at, model, tokens_in, tokens_out, cost_cents)`.
   - All reads return typed records. All writes wrap in a single transaction.

2. **`app/run/sessions/page.tsx`** — Claude Code session table. Source: `~/.claude/sessions.json` if it exists, else gracefully empty. Columns: started, harness, model, tokens, cost, duration.

3. **`app/run/operator/page.tsx`** — `/operator deploy <name>` runs with cost + exit. Source: `~/.claude/operator/runs/` log files (check actual shape on disk first; assume newline-delimited JSON per run).

4. **`app/run/webhook-tail/page.tsx`** — last 100 inbound deliveries across all slugs. Server-side polling via `force-dynamic` for now (no client WebSocket until Phase 4).

5. **`app/run/cost/page.tsx`** — daily roll-up from `sessions` + `operator_runs`. Tiny sparkline + per-source bar.

6. **`app/api/webhooks/[slug]/route.ts`** — inbound webhook receiver.
   - Lookup `slug` in `webhook.json.inbound` via `lib/config.ts`.
   - Resolve `secretRef` → fetch from OS keychain / Infisical / env / gh-secret per `secret-refs.json` provider. **Never cache beyond the single request.**
   - Verify HMAC-SHA256 of raw body against `X-Signature` header (or whatever the slug declares).
   - On success: persist to `webhook_deliveries`, dispatch to `targetSkill` (Phase 3 stub: just log the dispatch intent; actual skill invocation can wait for Phase 4).
   - On bad sig: 401, log to `webhook_deliveries` with `status=rejected`.

### Configure-room follow-ups (none — self-review closed them)

The Phase 2 nav-counts gap is fixed. No outstanding Configure work blocks Phase 3.

### Hard rules (don't break)

- **Bridge reads-only from `yielde-bridge-config/`** — Phase 3 writes go to `~/.claude/bridge/runtime/runtime.db` instead. Different file tree, different invariant. Server routes still never touch the registry repo.
- **Webhook secrets resolved at request time** — fetched fresh from OS keychain / Infisical per delivery. Never cache beyond the single request. `secret-refs.json` only names the path.
- **`better-sqlite3` is sync** — fine at our scale, but never call from a hot loop. Wrap reads in `force-dynamic` pages, wrap writes in single transactions.
- **No PII in `webhook_deliveries.body_blob` without a retention plan.** Phase 3 stores raw bodies for replay; Phase 4 adds a redaction layer + retention sweep.
- **Brain writes** still go through `brain-gatekeeper`'s `_inbox/` rules.
- **File-guard pattern** still blocks filenames containing `secret` (plural). Stick to `secret-refs.json` and similar.

### Verification gate before Phase 3 commit

- `npx tsc --noEmit` clean
- `npx eslint --max-warnings=0 lib/ components/ app/` clean
- `/run/{sessions,operator,webhook-tail,cost}` all render (likely empty) tables, not `PhasePlaceholder`
- POST a signed payload to `/api/webhooks/<slug>` for a configured inbound; row appears in webhook-tail; bad signature → 401, also logged
- `~/.claude/bridge/runtime/runtime.db` exists and is queryable from `sqlite3` CLI
- New brain draft in `_inbox/` describing what shipped, committed and pushed

---

## Open follow-ups (not blockers)

1. **`parseFrontmatter` triplication.** Still 3 copies (`lib/skills.ts` TS, `yielde-skills/scripts/build-index.mjs`, `yielde-skills/scripts/import-hermes.mjs`). Phase 2 didn't add a 4th caller — config reads JSON, not YAML. Extract to `yielde-skills/lib/frontmatter.mjs` only when a 4th YAML caller appears.

2. **`pinned` boolean parsing inconsistency.** Same status since Phase 1 — both implementations work for current data. Same fix as #1.

3. **Windows libuv shutdown assertion.** Encoded in `app/api/skills/import-hermes/route.ts`. Reapply the same `result.code === N || stderr-substring-match` pattern to any Phase 3 endpoint that spawns Node scripts (e.g. if the webhook dispatcher ever shells out to `bridge` or a skill runner).

4. **`/brain-log promote` outstanding for four drafts** (Chris-only action; agent must not promote):
   - `_inbox/2026-05-12-yielde-bridge-phase-0-kickoff.md` (decision)
   - `_inbox/2026-05-12-yielde-bridge-phase-0-complete.md` (staff-work)
   - `_inbox/2026-05-12-1326-yielde-bridge-phase-1-shipped.md` (staff-work)
   - `_inbox/2026-05-12-1556-yielde-bridge-phase-2-shipped.md` (staff-work)

5. **LF/CRLF noise.** Every Windows commit warns. Cosmetic. `.gitattributes` with `* text=auto eol=lf` in all three repos would silence it. Deferred.

6. **`scripts/bridge.mjs` `DEFAULT_BODY` duplicates schema knowledge** with empty stubs in `yielde-bridge-config`. Single-source on schema bumps; safe today at schema_version 1.0 across the board.

7. **5 inline badge components** (`TransportBadge`, `AuthBadge`, `VerifyBadge`, `ProviderBadge`, `GateBadge`) follow the existing inline `ProvenanceBadge` pattern. Consolidation to a generic `<Badge variant={...}>` is premature — each carries distinct domain semantics.

---

## Quick-reference paths

| What | Where |
|---|---|
| Bridge app | `C:\Users\chris\yielde-bridge\` (Next.js 16, `npm run dev` → :3030) |
| Skills repo (public, MIT) | `C:\Users\chris\yielde-skills\` |
| Config repo (private) | `C:\Users\chris\yielde-bridge-config\` — empty Phase 0 stubs at HEAD `cef0d72` |
| Brain | `C:\Users\chris\yielde-brain\` — write `_inbox/` ONLY |
| Project memory | `~/.claude/projects/C--Users-chris/memory/project_yielde_bridge.md` |
| Yielde OS capabilities | `~/.claude/os/capabilities/registry.json` (36 caps, 2 hard-gated) |
| Junctions | `~/.claude/skills/{yielde,hermes}/` → `yielde-skills/skills/{yielde,hermes}/` |
| Telemetry sidecar | `~/.claude/skills/.usage.json` |
| Phase 3 runtime DB (will exist) | `~/.claude/bridge/runtime/runtime.db` |

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

Override config root via `YIELDE_BRIDGE_CONFIG_ROOT=/path/to/config`. Secret-leak guard refuses literal `sk-…`, `ghp_…`, `xox[bp]-…`, `AIza…`, JWT-shape tokens with `exit 2` — fail closed, no disk write.

## Smoke tests to run before any Phase 3 work

```bash
# 1. Junctions intact + registries empty
ls /c/Users/chris/.claude/skills/yielde   # 4 dirs
ls /c/Users/chris/.claude/skills/hermes   # 5 dirs
grep -c '"servers": {}'  /c/Users/chris/yielde-bridge-config/mcp.json         # 1
grep -c '"connectors": {}' /c/Users/chris/yielde-bridge-config/api.json       # 1

# 2. Bridge typechecks + lints clean
cd /c/Users/chris/yielde-bridge && npx tsc --noEmit && npx eslint --max-warnings=0 lib/ components/ app/

# 3. Dev server serves every Configure panel
npm run dev   # background
for p in mcp api webhooks secret-refs capabilities skills; do
  curl -s -o /dev/null -w "/$p %{http_code}\n" http://localhost:3030/configure/$p
done
# expect: all 200

# 4. Nav badges render live counts
curl -s http://localhost:3030/configure/skills | grep -oE 'tabular-nums">[0-9]+' | head -6
# expect: Skills=9, Capabilities=36, MCP/API/Webhooks/Secrets=0 (in some order)

# 5. Capabilities panel surfaces real OS registry data
curl -s http://localhost:3030/configure/capabilities | grep -c paystack-live   # >= 1

# 6. CLI round-trips (leaves config repo back at HEAD cef0d72)
node scripts/bridge.mjs add mcp smoke-test --transport stdio --command "echo ok"
node scripts/bridge.mjs list mcp | grep -c smoke-test    # 1
node scripts/bridge.mjs remove mcp smoke-test
node scripts/bridge.mjs list mcp | grep -c smoke-test    # 0

# 7. Secret-leak guard fails closed
node scripts/bridge.mjs add api leak --base-url https://x --auth-ref "sk-12345678901234567890123456789012"
# expect: exit 2, refusal message; no write to api.json

# 8. Telemetry round-trips (Phase 1 regression check)
curl -s -X POST -H 'content-type: application/json' -d '{"name":"arxiv"}' http://localhost:3030/api/skills/use
cat /c/Users/chris/.claude/skills/.usage.json | grep -c '"arxiv"'   # >= 1
```

If any check fails, diagnose before opening Phase 3.

---

## Phase 4+ on the radar (for context only — do not start)

- **Phase 4 — Inspect room.** Audit search, brain `_inbox/` diff+promote UI, capability decision log, skill traces, signed-webhook redaction layer.
- **Phase 5 — Co-founder rollout.** Node-only CLI fallback for Devon/Lyell, GitHub-issue handoff skill for capability escalation.
- **Phase 6 — Innovation tier.** Skill provenance graph, eval harness, curator with Chris-approve, bulk Hermes import.

These are deliberately out-of-scope until Phase 3 is verified end-to-end.
