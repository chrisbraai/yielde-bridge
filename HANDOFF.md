# Yielde Bridge — handoff (post Phase 2)

Last session: 2026-05-12, ended after Phase 2 ship (`c6bf4d6`). Next session picks up Phase 3 (Run room — live sessions, operator runs, webhook tail, cost meter).

---

## Handoff prompt (paste into a fresh Claude Code session)

> Resume Yielde Bridge Phase 3.
>
> 1. Read `~/.claude/projects/C--Users-chris/memory/project_yielde_bridge.md` — Phase 0 ✅, Phase 1 ✅, Phase 2 ✅ (registries + Configure panels + bridge CLI, 2026-05-12, commit `c6bf4d6`). Run the 6 "Verification on session resume" checks before touching code.
> 2. Read `C:\Users\chris\yielde-bridge\HANDOFF.md` (this file) for Phase 3 plan + open follow-ups.
> 3. Read `C:\Users\chris\yielde-bridge\AGENTS.md` — the Next.js 16 / Turbopack / React 19 quirks, plus rule #3: Phase 3 is the first phase where Bridge writes state. SQLite for webhook archive.
> 4. **Do NOT load `~/.claude/CLAUDE.md`'s full brain index unless a task explicitly touches `yielde-platform`, `yielde-site`, a client slug, or co-founder work.** Repo-local to `yielde-bridge` and `yielde-bridge-config`. Brain writes go through `brain-gatekeeper` rules: `_inbox/` drafts only, never canonical files.
> 5. Start Phase 3: `app/run/{sessions,operator,webhook-tail,cost}/page.tsx` real panels, SQLite-backed webhook archive at `~/.claude/bridge/runtime/webhook-archive.db`, inbound webhook receiver route. See Phase 3 plan in HANDOFF.md.
> 6. At meaningful milestones, write a draft to `yielde-brain/_inbox/YYYY-MM-DD-HHMM-<slug>.md`, commit, and push.
>
> Work without stopping to ask clarifying questions when the reasonable call is obvious. Use TaskCreate to track multi-step work.

---

## What just shipped (Phase 2)

| Repo | Commit | Highlights |
|---|---|---|
| `yielde-bridge` | `c6bf4d6` | `lib/config.ts` registry reader, 5 Configure panels (mcp/api/webhooks/secret-refs/capabilities), `scripts/bridge.mjs` CLI with secret-leak guard, shared `RegistryEmpty`+`RegistryHeader` components |
| `yielde-bridge-config` | `a772acc → cef0d72` | 8 commits across fixture round-trip — net zero, HEAD back at empty Phase 0 stubs |
| `yielde-brain` | `aafcebb` | `_inbox/2026-05-12-1556-yielde-bridge-phase-2-shipped.md` draft (awaiting `/brain-log promote`) |

The `bridge` CLI is wired as both `npm run bridge` and `bin.bridge` in `package.json`.

---

## Phase 3 plan (Run room + webhook archive)

**Invariant change:** Phase 3 is the first phase where Bridge **writes** runtime state. Registry repo is still read-only (CLI + git). Bridge gains a *separate* SQLite-backed runtime layer at `~/.claude/bridge/runtime/`. Keep these two clearly distinguished — registry = source-of-truth in git, runtime = local cache + audit.

### Files to land (yielde-bridge)

1. `lib/runtime.ts` — SQLite wrapper using `better-sqlite3` (Node bindings handle Windows cleanly). Init schema on first read. Tables:
   - `webhook_deliveries(id, slug, received_at, source_ip, payload_hash, status, body_blob)` — last 100 per slug, retention via trigger.
   - `operator_runs(id, agent, started_at, finished_at, exit_code, cost_cents)`.
   - `sessions(id, harness, started_at, ended_at, model, tokens_in, tokens_out, cost_cents)`.
2. `app/run/sessions/page.tsx` — real table of Claude Code sessions Bridge observes (reads `~/.claude/sessions.json` or wherever harness is writing).
3. `app/run/operator/page.tsx` — runs of `/operator deploy <name>` agents with cost + exit.
4. `app/run/webhook-tail/page.tsx` — last 100 inbound deliveries across all slugs. Tail mode (server-side polling, no client WebSocket yet).
5. `app/run/cost/page.tsx` — daily cost roll-up from `sessions` + `operator_runs`.
6. `app/api/webhooks/[slug]/route.ts` — inbound webhook receiver. Verifies HMAC against `secret-refs.json` ↔ OS keychain/Infisical, persists to `webhook_deliveries`, routes to `targetSkill` per `webhook.json` inbound entry.

### Configure-room follow-ups (small)

- Wire `registryCounts()` into `components/configure-nav.tsx` — currently the badges are `null`. One server call, displayed as `(N)` next to each label. Already exported from `lib/config.ts`.

### Hard rules (don't break)

- **Bridge still reads-only from `yielde-bridge-config/`.** Phase 3 writes go to `~/.claude/bridge/runtime/*.db` instead. Different file tree, different invariant.
- **Webhook secrets resolved at request time** — fetched fresh from OS keychain / Infisical per delivery, never cached in memory beyond the single request. `secret-refs.json` only names the path.
- **`better-sqlite3` is sync** — fine for our scale, but never call it from a hot loop. Wrap reads in `force-dynamic` pages, wrap writes in single transactions.
- **Brain writes** still go through `brain-gatekeeper`'s `_inbox/` rules.

### Verification gate before Phase 3 commit

- `npx tsc --noEmit` clean
- `npx eslint --max-warnings=0 lib/ components/ app/` clean
- `/run/{sessions,operator,webhook-tail,cost}` all render (likely empty) tables, not `PhasePlaceholder`
- POST a signed payload to `/api/webhooks/<slug>` for a configured inbound; row appears in webhook-tail; bad signature → 401
- New brain draft in `_inbox/` describing what shipped, committed and pushed

---

## Open follow-ups from Phase 2 (not blockers)

1. **ConfigureNav badge counts.** `registryCounts()` exists but `components/configure-nav.tsx` still hard-codes `count: null`. Trivial wire-up — pass counts from a server parent or use a per-panel async preload.

2. **`parseFrontmatter` triplication.** Phase 2 didn't add a fourth caller (config reads JSON). Note still valid for Phase 3 if a YAML caller appears.

3. **`pinned` boolean parsing inconsistency.** Same status as Phase 1 — both implementations work for current data.

4. **Windows libuv shutdown assertion.** Still encoded in `app/api/skills/import-hermes/route.ts`. Reapply pattern to any Phase 3 endpoint that spawns Node scripts.

5. **`/brain-log promote` outstanding for four drafts:**
   - `_inbox/2026-05-12-yielde-bridge-phase-0-kickoff.md` (decision)
   - `_inbox/2026-05-12-yielde-bridge-phase-0-complete.md` (staff-work)
   - `_inbox/2026-05-12-1326-yielde-bridge-phase-1-shipped.md` (staff-work)
   - `_inbox/2026-05-12-1556-yielde-bridge-phase-2-shipped.md` (staff-work) ← new
   Chris-only action; agent must not promote.

6. **LF/CRLF noise** — cosmetic, still un-silenced. `.gitattributes` `* text=auto eol=lf` would clean it in all three repos.

---

## Quick-reference paths

| What | Where |
|---|---|
| Bridge app | `C:\Users\chris\yielde-bridge\` (Next.js 16, `npm run dev` → :3030) |
| Skills repo (public, MIT) | `C:\Users\chris\yielde-skills\` |
| Config repo (private) | `C:\Users\chris\yielde-bridge-config\` — 4 empty Phase 0 stubs after Phase 2 cleanup |
| Brain | `C:\Users\chris\yielde-brain\` — write `_inbox/` ONLY |
| Project memory | `~/.claude/projects/C--Users-chris/memory/project_yielde_bridge.md` |
| Yielde OS capabilities | `~/.claude/os/capabilities/registry.json` (36 caps, 2 hard-gated) |
| Junctions | `~/.claude/skills/{yielde,hermes}/` → `yielde-skills/skills/{yielde,hermes}/` |
| Telemetry sidecar | `~/.claude/skills/.usage.json` |
| Phase 3 runtime (will exist) | `~/.claude/bridge/runtime/webhook-archive.db` |

## CLI cheatsheet (`bridge`)

```bash
node scripts/bridge.mjs sync                  # git pull --rebase the config repo
node scripts/bridge.mjs list mcp              # pretty-print mcp.json
node scripts/bridge.mjs add mcp <name> --transport stdio --command "npx ..."
node scripts/bridge.mjs add api <name> --base-url <url> --auth-ref <ref> [--auth bearer|api-key|oauth|basic|none] [--rpm N]
node scripts/bridge.mjs add webhook <slug> --target-skill <skill> --secret-ref <ref> [--verify hmac-sha256|none]
node scripts/bridge.mjs add webhook-out <name> --url <url> [--auth-ref <ref>] [--max-attempts N]
node scripts/bridge.mjs add secret-ref <name> --provider infisical|os-keychain|env|gh-secret --path <path>
node scripts/bridge.mjs remove mcp|api|webhook|secret-ref <name>
```

Override config root via `YIELDE_BRIDGE_CONFIG_ROOT=/path/to/config`. Secret-leak guard rejects literal `sk-…`, `ghp_…`, `xox[bp]-…`, `AIza…`, and JWT-shape tokens with exit 2 — fail closed, no disk write.

## Smoke tests to run before any Phase 3 work

```bash
# 1. Junctions intact, 9 skills, registries empty
ls /c/Users/chris/.claude/skills/yielde   # 4 dirs
ls /c/Users/chris/.claude/skills/hermes   # 5 dirs
cat /c/Users/chris/yielde-bridge-config/mcp.json | grep -c '"servers": {}'  # 1

# 2. Bridge typechecks + lints clean
cd /c/Users/chris/yielde-bridge && npx tsc --noEmit && npx eslint --max-warnings=0 lib/ components/ app/

# 3. Dev server serves all panels
npm run dev   # background
for p in mcp api webhooks secret-refs capabilities skills; do
  curl -s -o /dev/null -w "/$p %{http_code}\n" http://localhost:3030/configure/$p
done
# expect: all 200

# 4. Capabilities page surfaces real registry data
curl -s http://localhost:3030/configure/capabilities | grep -c 'paystack-live'   # >= 1

# 5. CLI round-trips
node scripts/bridge.mjs add mcp smoke-test --transport stdio --command "echo ok"
node scripts/bridge.mjs list mcp | grep -c smoke-test    # 1
node scripts/bridge.mjs remove mcp smoke-test
node scripts/bridge.mjs list mcp | grep -c smoke-test    # 0

# 6. Secret-leak guard
node scripts/bridge.mjs add api leak --base-url https://x --auth-ref "sk-12345678901234567890123456789012"
# expect: exit 2, refusal message
```

If any check fails, diagnose before opening Phase 3.
