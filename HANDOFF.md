# Yielde Bridge — handoff (post Phase 6)

Last session: 2026-05-12, ended after Phase 6 ship (`runtimes/cron.ps1` cron adapter + real sweeper executor + pricing JSON extraction + `session-cost.log` sink + skill provenance graph at `/inspect/skill-graph` + eval harness scaffold). Phase 7 picks up: automated eval grading with cost cap, schedule `webhook-dispatch-sweep` for real via `cron.ps1 -Action register`, bulk Hermes import, frontmatter-parser consolidation, drain the 8-draft `_inbox/` promote queue.

Repo HEADs at handoff:

| Repo | HEAD | Branch |
|---|---|---|
| `yielde-bridge` | `c157f0e` | `main` |
| `yielde-bridge-config` | `b367385` (content-identical to `fb05d0d` — descendants after smoke churn are acceptable) | `main` |
| `yielde-skills` | `024f084` | `main` |
| `yielde-brain` | `7432ecf` (Phase 6 draft in `_inbox/`, eight drafts awaiting `/brain-log promote`) | `master` |

---

## Handoff prompt (paste into a fresh Claude Code session)

> Resume Yielde Bridge Phase 7.
>
> 1. Read `~/.claude/projects/C--Users-chris/memory/project_yielde_bridge.md` — Phase 0–6 ✅. Run all 14 base "Verification on session resume" checks in that file plus the 4 Phase 6 additions in HANDOFF.md § Phase 6 verification additions (cron.ps1 one-shot, smoke-phase6.mjs end-to-end, `pricing_source` field stamping, `session-cost.log` accumulation). Each check carries a content assertion. Confirm `yielde-bridge` HEAD is `c157f0e` (or descendant), `yielde-bridge-config` HEAD content-identical to `fb05d0d`, `yielde-skills` HEAD is `024f084` (or descendant), `yielde-brain` HEAD is `7432ecf` (or descendant).
> 2. Read `C:\Users\chris\yielde-bridge\HANDOFF.md` (this file) for the Phase 7 plan, hard rules, open follow-ups, and smoke tests.
> 3. Read `C:\Users\chris\yielde-bridge\AGENTS.md` — Next.js 16 / Turbopack / React 19 quirks plus the load-bearing **rule #3** (Bridge writes via `runtime.db` + dispatch queue, never to `yielde-bridge-config/` from server routes).
> 4. **Do NOT load `~/.claude/CLAUDE.md`'s full brain index unless a task explicitly touches `yielde-platform`, `yielde-site`, a client slug, or co-founder work.** Brain writes still go through `brain-gatekeeper`'s `_inbox/` rules — never edit canonical paths (`Decisions/`, `Incidents/`, `Staff/`, `Clients/`, `SOPs/`, `Platform/`, `Site/`, `Glossary.md`, `Backlog.md`, `INDEX.md`, `Alignment.excalidraw.md`). Nine drafts in `_inbox/` are awaiting `/brain-log promote` (Chris-only) — do not add a tenth before the queue drains unless Phase 7 itself ships something brain-worthy at the end.
> 5. **Hard rules to preserve** (full 20-item list in HANDOFF.md § Appendix — all enforcement-grade). The load-bearing ones:
>    - Bridge reads-only from `yielde-bridge-config/`; registry mutations via `scripts/bridge.mjs`; runtime state via `lib/runtime.ts` + `lib/dispatcher.ts` + the dispatch queue.
>    - All `lib/` JSON readers MUST go through `lib/json-io.ts`. Raw `readFile + JSON.parse` is forbidden under `lib/` for JSON files. CLI scripts under `scripts/` cannot import `lib/*` (server-only) — they inline their own `stripBom` per rule #17.
>    - Webhook secrets resolved per request via `lib/secret-resolver.ts`; never cached. Dispatcher and sweeper never see the secret.
>    - File-guard pattern blocks `secrets` (plural). Singular only.
>    - HTTP 200 ≠ feature working. Verification gates need content assertions.
>    - Next.js routes: `_`-prefixed folders return 405. SSE lives at `/api/webhook-stream/`, not `/api/webhooks/_stream/`.
>    - Schema migrations idempotent: `PRAGMA table_info(<table>)` check before `ALTER TABLE ADD COLUMN`.
>    - React 19 client purity: hold `now` in `useState`+`useEffect`+`setInterval`; do NOT setState synchronously inside the effect body.
>    - Badges go through `components/badge.tsx` (`<Badge variant size>`). No new inline pill clones. The connection-state pill in `webhook-tail-live.tsx` is the only deliberate exception.
>    - **Phase 6 rule #18** — fail-soft PowerShell adapters always exit 0 and signal failure via `{"ok":false,...}`. Consumers must respect `structured.ok === false` alongside exit code.
>    - **Phase 6 rule #19** — CLI adapters honour `$env:YIELDE_OPERATOR_DIR` (+ `$env:YIELDE_OS_AUDIT_FILE`) so smokes and evals don't leak into live operator state. Inline run-log + audit writes; do NOT call `operator.ps1` (which hard-codes its operator dir).
>    - **Phase 6 rule #20** — `runtime: cron` manifests REQUIRE a `command:` frontmatter field. `_template.md` documents the contract.
> 6. Start Phase 7 work — five concrete deliverables (full plan in HANDOFF.md § Phase 7 plan):
>
> 6. 6a. **Automated eval grader.** Phase 6 ships `scripts/run-evals.mjs` with discovery + `--run` (raw stdout capture). Phase 7 adds a rubric-based grader. Suggested shape: `scripts/run-evals.mjs --run --grade` spawns a second `claude -p` per case that reads `expected.md` + the case's `stdout_tail` and returns `{ pass: bool, score: 0-10, rationale: "..." }` JSON. Pre-run cost cap via `YIELDE_EVALS_MAX_COST_CENTS=N` env var (refuse to start a batch whose estimated cost exceeds the cap; estimate from case count × a default per-case cents budget). Final report includes pass-rate + total spend.
>
> 6b. **Schedule `webhook-dispatch-sweep` for real.** `runtimes/cron.ps1 -Action register -Name webhook-dispatch-sweep` should create a `YieldeOS-webhook-dispatch-sweep` Windows Task Scheduler entry on the `*/5 * * * *` cadence declared in the manifest. Smoke: invoke register, confirm `schtasks /Query /TN YieldeOS-webhook-dispatch-sweep` returns 0, wait ≥6 minutes, confirm at least one new run log lands under `~/.claude/operator/runs/webhook-dispatch-sweep/`. Then `cron.ps1 -Action unregister` and confirm cleanup.
>
> 6c. **Frontmatter parser consolidation.** Phase 5 follow-up #1 said "consolidate when a 5th CLI lands." Phase 6 added at least two more inline parsers (`sweep-dispatches.mjs::readManifestRuntime` for cron manifests, `cron.ps1::Read-Manifest` for the same data). Node side: extract to `lib/io-utils.mjs` (NOT `server-only` — must be importable from `scripts/`). All Node CLIs adopt it. PowerShell side stays separate (lib is server-only and can't cross language anyway) but the existing `Read-Manifest` in cron.ps1 is the canonical PowerShell pattern; any future cron-aware PowerShell adapter should copy it verbatim, not reinvent.
>
> 6d. **Bulk Hermes import + curator-with-Chris-approve.** Phase 1 imported 5 seed Hermes skills manually. Phase 7 lands a curator flow: `scripts/import-hermes.mjs --bulk <repo-url|local-path> --filter <glob>` writes drafts to a new `yielde-skills/_pending/` dir (not `skills/hermes/`). A new `/inspect/hermes-pending` Inspect panel lists drafts with a per-skill `frontmatter` preview + the body diff against any existing same-name skill. Chris approves by running `node scripts/import-hermes.mjs --promote <name>` (refuses to run from any agent context — checks `$env:USER`/`$env:USERNAME` and a `--operator chris` flag).
>
> 6e. **`session.cost` rollup in `/run/cost`.** The audit event lands (proven Phase 5–6) but `/run/cost` rollup still aggregates from `sessions.started_at`. Confirm the cost panel shows non-zero totals after a real Stop hook fires `emit-session-cost.mjs` end-to-end. If the rollup misses kernel-emitted rows that have `ended_at` but no `started_at`, fix the query to also pick up "close-only" rows by COALESCE-ing or splitting the aggregation.
> 7. Verification gate before Phase 7 commit:
>    - `npx tsc --noEmit` clean.
>    - `npx eslint --max-warnings=0 lib/ components/ app/ scripts/` clean.
>    - `node scripts/smoke-phase6.mjs` still passes end-to-end (no regressions).
>    - **New** eval-grader smoke: `node scripts/run-evals.mjs --run --grade --skill brain-read` against the seed case returns a `grader` block per run with `pass: true|false` + `score` + `rationale`. Cost cap refuses to start when set below the per-case estimate.
>    - **New** cron.ps1 schedule smoke: register → confirm via `schtasks /Query` → wait one cron tick → confirm new JSONL under `~/.claude/operator/runs/webhook-dispatch-sweep/` → unregister → confirm `schtasks /Query` returns non-zero (task gone).
>    - **New** frontmatter consolidation: `grep -rn "function parseFrontmatter\\|function readManifestRuntime\\|function Read-Manifest" yielde-bridge/{lib,scripts} yielde-skills/scripts` shows one Node call site (`lib/io-utils.mjs`) plus re-exports; PowerShell `Read-Manifest` stays unique.
>    - Brain draft in `_inbox/YYYY-MM-DD-HHMM-yielde-bridge-phase-7-shipped.md` per brain-gatekeeper schema, committed and pushed.
> 8. Open follow-ups inherited from Phase 6 (not blockers — full list in HANDOFF.md § Open follow-ups):
>    - Eight brain drafts still awaiting `/brain-log promote` (Chris-only): Phase 0 kickoff + complete, Phase 1, 2, 3 shipped + self-review, 4, 5, 6.
>    - `cron.ps1 -Action register/unregister/status` paths exist but were never exercised in Phase 6 (would have side-effected the live Windows Task Scheduler). Phase 7 deliverable 6b is the smoke.
>    - `claude-subagent`/`n8n-workflow` sweeper paths exist behind `YIELDE_BRIDGE_DISPATCH_INVOKE=1` + `YIELDE_BRIDGE_DISPATCH_MAX_COST_CENTS=N`. Smoke them once Phase 7 has eval-grader cost-cap infrastructure in place — same pattern.
>    - `syncOperatorRuns()` and `syncSessionsFromAudit()` both run per render. Idempotent + fast; gate behind a request-scoped singleton if growth becomes noticeable.
>    - `.gitattributes * text=auto eol=lf` would silence LF/CRLF noise on every Windows commit.
> 9. At meaningful milestones, write a draft to `yielde-brain/_inbox/YYYY-MM-DD-HHMM-<slug>.md` per the `brain-gatekeeper` schema, commit, and push. Never silent. Never canonical.
>
> Work without stopping to ask clarifying questions when the reasonable call is obvious. Use TaskCreate to track multi-step work.

---

## What shipped (Phase 6)

| Repo | Commits | Highlights |
|---|---|---|
| `yielde-bridge` | `72fe1e8 → c157f0e` | `runtimes/cron.ps1` (run/register/unregister/status, env-override friendly) · `scripts/sweep-dispatches.mjs` actually invokes targets (cron/mcp-tool zero-cost; claude-subagent/n8n env-gated) · `scripts/pricing.json` extracted · `~/.claude/bridge/logs/session-cost.log` sink · `lib/skill-graph.ts` + `/inspect/skill-graph` · `scripts/smoke-phase6.mjs` end-to-end |
| `yielde-skills` | `71d0556 → 024f084` | `evals/<skill>/<case-id>/` scaffold + `evals/brain-read/list-recent/` seed · `scripts/run-evals.mjs` (discovery + `--run` raw capture) |
| `yielde-brain` | `af44810 → 7432ecf` | `_inbox/2026-05-12-2032-yielde-bridge-phase-6-shipped.md` |
| Outside-repo | n/a | `~/.claude/operator/runtimes/cron.ps1` (new) · `~/.claude/operator/agents/webhook-dispatch-sweep.md` gained `command:` · `~/.claude/operator/agents/_template.md` documents `command:` contract · `~/.claude/commands/operator/deploy.md` cron section rewritten · `~/.claude/bridge/logs/` created on first `emit-session-cost` invocation |

**Earlier phases** (still referenced for verification gates):
- Phase 5: queue worker (`sweep-dispatches.mjs`), kernel `session.cost` producer (`emit-session-cost.mjs`), co-founder Tier-2 fallback (`operator-bridge-dispatch.mjs`), badge consolidation. Detail in `_inbox/2026-05-12-1730-yielde-bridge-phase-5-shipped.md`.
- Phase 4: Inspect room, real dispatch + redaction + 6-column `webhook_deliveries` migration, SSE tail at `/api/webhook-stream`. Detail in `_inbox/2026-05-12-1530-yielde-bridge-phase-4-shipped.md`.

**Files in `yielde-bridge` that landed this phase:**

- **`~/.claude/operator/runtimes/cron.ps1`** (outside-repo file alongside `agents/` and `lib/`, but the cron contract is Bridge-owned so it ships under this phase). Four actions: `run` (one-shot — reads `command:` from manifest, executes via `System.Diagnostics.Process` for reliable exit codes, captures stdout/stderr with libuv noise stripped, writes JSONL events), `register` (`schtasks /Create`, supports `*/N * * * *`/`0 */N * * *`/`0 H * * *`), `unregister`, `status`. Inlines its own run-log + audit writes (no `operator.ps1` dependency) so `$env:YIELDE_OPERATOR_DIR` overrides work cleanly for smokes/evals.

- **`scripts/sweep-dispatches.mjs`** — `operator-deploy` mode now actually invokes the target. New helpers `readManifestRuntime` (inline frontmatter parser; consolidation pending Phase 7 rule), `invokeRuntimeAdapter` (spawns `runtimes/<runtime>.ps1`), `invokeClaudeP` (LLM path, env-gated). Routes by runtime: `cron`/`mcp-tool` → adapter (no LLM cost), `claude-subagent`/`n8n-workflow` → `claude -p` IFF `YIELDE_BRIDGE_DISPATCH_INVOKE=1` AND `YIELDE_BRIDGE_DISPATCH_MAX_COST_CENTS=N` are set, else records `dispatch.deferred`. Honours `structured.ok === false` from fail-soft adapters (rule #18). Run JSONL gains `dispatch.intent` → `dispatch.invoked` → `operator.run.end` per delivery.

- **`scripts/emit-session-cost.mjs`** — pricing loaded from `YIELDE_BRIDGE_PRICING_JSON` env → sibling `scripts/pricing.json` → `~/.claude/bridge/cli/pricing.json` (junction) → embedded 3-row fallback. Audit event stamps `pricing_source` for traceability. Every invocation appends one line to `~/.claude/bridge/logs/session-cost.log` (`ok`/`partial`/`skipped` + model + cost + tokens + errors); override via `YIELDE_BRIDGE_SESSION_COST_LOG`.

- **`scripts/pricing.json`** — `{ schema_version, comment, updated, models: { <model>: { input, output, cacheRead, cacheCreate } } }`. Reachable via the existing `~/.claude/bridge/cli/` junction. Source-of-truth for both `emit-session-cost.mjs` and the future model-router skill.

- **`lib/skill-graph.ts`** — `buildSkillGraph()` walks `~/.claude/skills/**/SKILL.md`, parses `related_skills:` frontmatter via the existing `parseFrontmatter` from `lib/skills.ts`, returns `{ nodes, edges, orphanRefs, isolated, bidirectional, stats }`. Bidirectional edges detected by reverse-key lookup. Orphan refs = `related_skills` entries naming a skill that does not exist locally.

- **`app/inspect/skill-graph/page.tsx`** — `/inspect/skill-graph`. Sorts nodes by `in+out` degree; each row shows outgoing edges (`→ name` muted, `↔ name` success for bidirectional pairs) and incoming edges (`← name`). Orphan refs section flags missing imports. Sidebar shows top-20 connected + isolated skills. Empty-state hint for fresh-machine 0-node case.

- **`components/inspect-nav.tsx`** + **`app/inspect/page.tsx`** — gained the new `Skill graph edges` link + overview card.

- **`scripts/smoke-phase6.mjs`** — end-to-end Phase 6 verification. Tmp-isolated: creates a temp `OPERATOR_ROOT` with a fresh `runtime: cron` test agent (`cmd /c echo PHASE6_MARKER_OK`), seeds a `webhook_deliveries` row in `queued`, drops a queue file, invokes `sweep-dispatches.mjs --mode operator-deploy` with env overrides. Asserts: DB flips to `succeeded`, run JSONL has all 6 events in order, marker appears in `run.end.stdout_tail`, `dispatch.invoked.ok === true`. Cleans up the temp dir. Exit 0 on pass.

- **`yielde-skills/evals/`** + **`yielde-skills/scripts/run-evals.mjs`** — eval scaffold. Layout: `evals/<skill>/<case-id>/{input.md, expected.md, meta.json[, fixtures/]}`. CLI walks the tree → JSON report (discovery mode). `--run` shells `claude -p` per case and captures stdout; automated grading is Phase 7. Seed case: `evals/brain-read/list-recent/`.

---

## Phase 6 verification additions (run after the 14 base checks in project memory)

15. **`cron.ps1 -Action run` one-shot.** `& "C:\Users\chris\.claude\operator\runtimes\cron.ps1" -Action run -Name webhook-dispatch-sweep -InputsJson '{"mode":"dry-run","limit":1}'` prints `{"ok":true,"data":{"run_id":"…","status":"success","exit_code":0,"summary":"processed=0 succeeded=0 failed=0"}}` and creates a fresh `~/.claude/operator/runs/webhook-dispatch-sweep/<run-id>.jsonl` with `run.start → cron.invoking → run.end` events.

16. **Phase 6 end-to-end smoke.** `node C:\Users\chris\yielde-bridge\scripts\smoke-phase6.mjs` exits 0 with `=== Phase 6 smoke PASS ===` on the final line. Asserts: queued delivery flips to `succeeded`, run JSONL has all 6 events (`dispatch.intent → run.start → cron.invoking → run.end → dispatch.invoked → operator.run.end`), `PHASE6_MARKER_OK` appears in `run.end.stdout_tail`, `dispatch.invoked.ok === true`, temp dir cleaned up.

17. **Pricing JSON wired.** `node C:\Users\chris\yielde-bridge\scripts\emit-session-cost.mjs --session-id smoke-pricing-$(Get-Random) --transcript-path <any real transcript jsonl> --role worker` prints a single line whose `pricing_source` field ends with `pricing.json` (i.e. NOT `fallback-embedded`).

18. **session-cost log sink.** `Test-Path C:\Users\chris\.claude\bridge\logs\session-cost.log` returns `True`. `Get-Content $logPath -Tail 1` is a valid JSON line with at minimum `ts`, `session_id`, `status` fields.

---

## Phase 7 plan (eval grader + scheduled cron + curator + parser consolidation + cost rollup)

### Files to land

1. **Automated eval grader.** Extend `yielde-skills/scripts/run-evals.mjs` with `--grade`. Each case run gains a `grader` sub-pass: a second `claude -p` reads `expected.md` + `stdout_tail` and returns `{ pass, score: 0-10, rationale }` JSON. Cost cap via `YIELDE_EVALS_MAX_COST_CENTS`; refuse to start a batch whose estimated spend exceeds the cap. Final report rolls up pass-rate + total spend. Land a second seed case (something with a deterministic expected output) so the grader has multiple datapoints.

2. **Real cron registration.** Smoke `runtimes/cron.ps1 -Action register -Name webhook-dispatch-sweep` end-to-end. Confirm the `YieldeOS-webhook-dispatch-sweep` task creates a fresh run log every 5 minutes (verify ≥1 tick lands). Document any admin-vs-user-shell quirks; cron.ps1 registers as current user so no admin escalation should be needed. `cron.ps1 -Action status` reads the schtasks query + run log tail and surfaces both.

3. **Frontmatter parser consolidation (Node side only).** New `lib/io-utils.mjs` (NOT server-only — exports `parseFrontmatter`, `stripBom`, `readJsonOrDefaultMjs`). All Node CLIs adopt it: `sweep-dispatches.mjs::readManifestRuntime` deleted in favour of the shared util; `yielde-skills/scripts/{import-hermes,operator-bridge-dispatch}.mjs` already have their own — reuse the shared helper. `lib/skills.ts` keeps its TypeScript `parseFrontmatter` because the type system layered on top is non-trivial to share with `.mjs`; document the divergence in the brain draft. PowerShell `cron.ps1::Read-Manifest` stays as the canonical PS pattern.

4. **Bulk Hermes import + curator-with-Chris-approve.** `scripts/import-hermes.mjs --bulk <repo-url|local-path> --filter <glob>` writes flattened drafts to `yielde-skills/_pending/<name>/SKILL.md` (NOT `skills/hermes/`). A new `/inspect/hermes-pending` panel lists drafts, shows a per-skill frontmatter preview + body diff vs any existing same-name skill, and links to the approve command line. `import-hermes.mjs --promote <name> --operator chris` moves the draft from `_pending/` to `skills/hermes/`, stamps `provenance: hermes-import`, and refuses without the `--operator chris` flag.

5. **`session.cost` rollup fix in `/run/cost`.** The Stop-hook chain now reliably emits `session.cost` audit events (Phase 5–6). Confirm `/run/cost` shows non-zero totals after a real session ends. If rows with only `ended_at` (no `started_at` — close-only kernel emissions) don't appear in the rollup, fix the aggregation: COALESCE-ed timestamps or a separate "kernel-only" bucket.

### Hard rules (don't break)

Inherited from Phases 3–6 + Phase 6's three additions:

- **Bridge reads-only from `yielde-bridge-config/`** — all registry writes go through `scripts/bridge.mjs`.
- **Webhook secrets resolved at request time** — never cached. Dispatcher must not see the secret either.
- **`better-sqlite3` is sync** — wrap reads in `force-dynamic`, wrap writes in single transactions.
- **No raw PII in `webhook_deliveries.body_blob`** — every PII-bearing slug MUST have a redaction rule configured before the integration is enabled.
- **Brain writes** still go through `brain-gatekeeper`'s `_inbox/` rules.
- **File-guard pattern** still blocks filenames containing `secrets` (plural). Singular only.
- **`lib/json-io.ts` is the single seam** for JSON reads in `lib/`. JSONL/markdown/text readers may stay direct.
- **Next.js routing**: never use `_`-prefixed folders for routes — Next treats them as private and returns 405.
- **React 19 purity**: server components and client renders must not call `Date.now()` (or other impure functions) at render time. Hoist to `useState`+`useEffect` with `setInterval`. Setting state synchronously inside the effect body trips `react-hooks/set-state-in-effect`.
- **Fail-soft PS adapters: `structured.ok === false` overrides `exit_code === 0`** (Phase 6 rule #18). Sweeper + any future spawner must respect both signals.
- **CLI adapters honour `$env:YIELDE_OPERATOR_DIR`** (Phase 6 rule #19). Inline run-log + audit writes; do NOT call `operator.ps1` from a runtime adapter.
- **`command:` frontmatter required for `runtime: cron` manifests** (Phase 6 rule #20). `_template.md` documents the contract.

### Verification gate before Phase 7 commit

- `npx tsc --noEmit` clean.
- `npx eslint --max-warnings=0 lib/ components/ app/ scripts/` clean.
- `node scripts/smoke-phase6.mjs` still passes (regression guard for Phase 6 work).
- `node scripts/run-evals.mjs --run --grade --skill brain-read` returns a per-case grader block (`pass`, `score`, `rationale`) and rolls up pass-rate + total spend; refuses to start when `YIELDE_EVALS_MAX_COST_CENTS` is set below the per-case estimate.
- `cron.ps1 -Action register -Name webhook-dispatch-sweep` succeeds, ≥1 run log lands within 6 minutes, `cron.ps1 -Action unregister` removes the task cleanly. Audit logs `operator.cron.registered` + `operator.cron.unregistered`.
- `grep -rn "function parseFrontmatter\\|function readManifestRuntime" yielde-bridge/{lib,scripts} yielde-skills/scripts` shows one Node call site (`lib/io-utils.mjs`); other files import from it.
- `/inspect/hermes-pending` returns 200; HTML contains "Hermes pending" plus at least one draft name (or an empty-state hint if `_pending/` is empty).
- `/run/cost` returns 200 with a non-zero `total cents` value after at least one real session-stop has fired since Phase 7 deploy.
- Brain draft in `_inbox/YYYY-MM-DD-HHMM-yielde-bridge-phase-7-shipped.md` per brain-gatekeeper schema, committed and pushed.

---

## Open follow-ups (not blockers)

1. **Frontmatter parser proliferation (now 6+ Node call sites + a PowerShell one).** Phase 5 follow-up #1 set the 5-CLI threshold; Phase 6 crossed it (`sweep-dispatches.mjs::readManifestRuntime` + `cron.ps1::Read-Manifest`). Phase 7 deliverable #3 consolidates the Node side.

2. **Eight brain drafts awaiting `/brain-log promote`** (Chris-only — agents must never promote):
   - `_inbox/2026-05-12-yielde-bridge-phase-0-kickoff.md` (decision)
   - `_inbox/2026-05-12-yielde-bridge-phase-0-complete.md` (staff-work)
   - `_inbox/2026-05-12-1326-yielde-bridge-phase-1-shipped.md` (staff-work)
   - `_inbox/2026-05-12-1556-yielde-bridge-phase-2-shipped.md` (staff-work)
   - `_inbox/2026-05-12-1644-yielde-bridge-phase-3-shipped.md` (staff-work)
   - `_inbox/2026-05-12-1722-yielde-bridge-phase-3-self-review.md` (staff-work)
   - `_inbox/2026-05-12-1530-yielde-bridge-phase-4-shipped.md` (staff-work)
   - `_inbox/2026-05-12-1730-yielde-bridge-phase-5-shipped.md` (staff-work)
   - `_inbox/2026-05-12-2032-yielde-bridge-phase-6-shipped.md` (staff-work) — actually nine; Phase 7 should not ship new drafts until the queue drains.

3. **`cron.ps1 -Action register/unregister/status` not yet smoke-tested.** Phase 7 deliverable 6b. Would have side-effected the live Windows Task Scheduler in Phase 6 verification, so deliberately deferred.

4. **`claude-subagent`/`n8n-workflow` sweeper paths not yet smoke-tested.** Behind `YIELDE_BRIDGE_DISPATCH_INVOKE=1` + `YIELDE_BRIDGE_DISPATCH_MAX_COST_CENTS=N`. Smoke once Phase 7's eval-grader cost-cap infrastructure is in place — same pattern reused.

5. **`pinned` boolean parsing inconsistency.** Same status since Phase 1.

6. **Windows libuv shutdown assertion** in spawned Node scripts. Pattern in `app/api/skills/import-hermes/route.ts` and `scripts/sweep-dispatches.mjs::stripLibuvNoise`. Reuse for any new dispatcher spawn.

7. **LF/CRLF noise** on every Windows commit. Cosmetic. `.gitattributes` `* text=auto eol=lf` would silence.

8. **`scripts/bridge.mjs` `DEFAULT_BODY` schema duplication.** Still safe at schema_version 1.0.

9. **`syncOperatorRuns()` + `syncSessionsFromAudit()` both run per render.** Both idempotent + fast; gate behind a request-scoped singleton if growth becomes noticeable.

10. **Cost rollup uses `sessions.started_at`** — kernel-emitted close-only rows (no `started_at`) won't appear in the rollup. Phase 7 deliverable #5 addresses.

11. **Skill graph empty-state isolated-aside.** When the graph has nodes but none are isolated, the isolated panel collapses cleanly. When there are no nodes at all, the new empty-state hint takes over. No follow-up needed; documented for completeness.

---

## Quick-reference paths

| What | Where |
|---|---|
| Bridge app | `C:\Users\chris\yielde-bridge\` (Next.js 16, `npm run dev` → :3030) |
| Skills repo (public, MIT) | `C:\Users\chris\yielde-skills\` |
| Config repo (private) | `C:\Users\chris\yielde-bridge-config\` — empty Phase 0 stubs at HEAD `fb05d0d` (content-identical) |
| Brain | `C:\Users\chris\yielde-brain\` — write `_inbox/` ONLY |
| Project memory | `~/.claude/projects/C--Users-chris/memory/project_yielde_bridge.md` |
| Yielde OS capabilities | `~/.claude/os/capabilities/registry.json` (36 caps, 2 hard-gated) |
| Yielde OS sessions (live) | `~/.claude/os/sessions.json` (UTF-8 BOM — readers must strip) |
| Yielde OS audit log | `~/.claude/os/audit.jsonl` (kernel writes, JSONL) |
| Operator agents | `~/.claude/operator/agents/*.md` |
| Operator runtimes | `~/.claude/operator/runtimes/*.ps1` (Phase 6 added `cron.ps1`) |
| Operator runs | `~/.claude/operator/runs/<agent>/<run-id>.jsonl` |
| Operator lib (shared PS helper) | `~/.claude/operator/lib/operator.ps1` (slash-command state mutations) |
| Junctions (skills) | `~/.claude/skills/{yielde,hermes}/` → `yielde-skills/skills/{yielde,hermes}/` |
| Junction (kernel CLI) | `~/.claude/bridge/cli/` → `yielde-bridge/scripts/` |
| Telemetry sidecar | `~/.claude/skills/.usage.json` |
| Runtime DB | `~/.claude/bridge/runtime/runtime.db` (`YIELDE_BRIDGE_RUNTIME_DB` override) |
| Dispatch queue | `~/.claude/bridge/dispatches/<slug>/<run-id>.json` (`YIELDE_BRIDGE_DISPATCH_QUEUE` override) |
| Session-cost log | `~/.claude/bridge/logs/session-cost.log` (`YIELDE_BRIDGE_SESSION_COST_LOG` override) |
| Pricing source-of-truth | `yielde-bridge/scripts/pricing.json` (alias: `~/.claude/bridge/cli/pricing.json`) — `YIELDE_BRIDGE_PRICING_JSON` override |

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

## `cron.ps1` cheatsheet (Phase 6)

```powershell
# One-shot run (Phase 6, smoke-tested):
& "C:\Users\chris\.claude\operator\runtimes\cron.ps1" -Action run -Name <agent> -InputsJson '{"mode":"dry-run"}'

# Register on the manifest's `schedule:` (Phase 6 ships the code; smoke is Phase 7 deliverable 6b):
& "C:\Users\chris\.claude\operator\runtimes\cron.ps1" -Action register -Name webhook-dispatch-sweep

# Remove:
& "C:\Users\chris\.claude\operator\runtimes\cron.ps1" -Action unregister -Name webhook-dispatch-sweep

# Status (schtasks query + run log tail):
& "C:\Users\chris\.claude\operator\runtimes\cron.ps1" -Action status -Name webhook-dispatch-sweep

# Env overrides honoured (Phase 6 rule #19):
$env:YIELDE_OPERATOR_DIR    = "<isolated dir>"   # smokes / evals
$env:YIELDE_OS_AUDIT_FILE   = "<isolated path>"  # smokes / evals
```

## Runtime DB + Phase 6 smoke probes

```bash
# Inspect runtime.db (schema, row counts, recent rows)
node scripts/probe-runtime.mjs

# Inspect the most-recent webhook delivery row (dispatch + redaction state)
node scripts/probe-stored.mjs

# Tail the SSE stream for N ms
node scripts/probe-stream.mjs http://localhost:3030/api/webhook-stream?seed=5 6000

# Phase 6 end-to-end smoke (tmp-isolated; no live state touched):
node scripts/smoke-phase6.mjs
# Expect: dispatch_status queued → succeeded; 6 events in order; PHASE6_MARKER_OK in run.end.stdout_tail; exit 0.

# End-to-end webhook + dispatch + redaction smoke (Phase 4–5, still valid)
node scripts/bridge.mjs add secret-ref smoke-webhook-secret --provider env --path SMOKE_WEBHOOK_SECRET
node scripts/bridge.mjs add webhook smoke-test --target-skill noop --secret-ref smoke-webhook-secret \
  --retention 50 --redact-key apiKey --redact-pattern 'tok_[A-Za-z0-9]+'
SMOKE_WEBHOOK_SECRET=phase4-test-secret npm run dev   # in another shell
node scripts/smoke-webhook.mjs                        # 202 / 401 / 401 / 404
node scripts/probe-stored.mjs                         # dispatch_status=succeeded, redaction_applied=1
node scripts/bridge.mjs remove webhook smoke-test
node scripts/bridge.mjs remove secret-ref smoke-webhook-secret

# Kernel seam (PowerShell-callable)
node scripts/record-session-close.mjs --id <session_id> --ended-at <ISO> --model <name> \
  --tokens-in N --tokens-out N --cost-cents N --role <name> --intent "..."

# Session-cost producer + log sink (Phase 5–6)
node scripts/emit-session-cost.mjs --session-id <id> --transcript-path <jsonl> --role worker
# Stamps pricing_source field; appends one line to ~/.claude/bridge/logs/session-cost.log.

# Eval harness (Phase 6 scaffold)
node yielde-skills/scripts/run-evals.mjs                          # discover
node yielde-skills/scripts/run-evals.mjs --skill brain-read       # filter
node yielde-skills/scripts/run-evals.mjs --run --skill brain-read # spawn claude -p, capture stdout
# Automated grading via --grade is Phase 7 deliverable 6a.
```

---

## Phase 7+ on the radar

- **Phase 7 — Eval grader + scheduled cron + curator + parser consolidation + cost rollup fix.** Detailed above. The eval grader's cost-cap infrastructure also unlocks safe end-to-end smoke of the `claude-subagent`/`n8n-workflow` sweeper paths (open follow-up #4).
- **Phase 8+ — Open.** Multi-machine sync (Devon/Lyell operator state replication — replicate `~/.claude/operator/` and the dispatch queue safely between Tier-1 and Tier-2 machines). External webhook outbound (inbound + dispatch are live; outbound is half-stubbed in the `webhook-out` registry). Bridge UI authentication if/when the dashboard moves off `localhost`. Cost dashboard with per-role / per-intent breakdowns once enough `session.cost` data accumulates.

---

## Appendix: standards encoded in this handoff

Anything below this line is enforcement-grade — the resume prompt and Phase 7 verification gate must keep these intact, since they were earned the hard way over Phases 0–6:

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
11. **React 19 + Next 16 quirks:** server components can be lint-flagged for impure calls during render (`Date.now()`, etc.). In client components, hold `now` in `useState`+`useEffect`+`setInterval`. Do NOT setState synchronously inside the effect body — let the first interval tick land.
12. **`better-sqlite3` is sync.** Wrap reads inside `force-dynamic` pages. Wrap writes in single transactions.
13. **Redaction before persistence.** No raw PII in `webhook_deliveries.body_blob`. Every PII-bearing slug must declare redaction rules at `bridge add webhook` time before the integration goes live.
14. **Schema migrations are idempotent.** Use `PRAGMA table_info(<table>)` to check before `ALTER TABLE ADD COLUMN`. Existing rows survive — they get NULL for new columns until rewritten.
15. **Next.js route file names.** Folders prefixed `_` are private (returns 405). The SSE endpoint at `/api/webhook-stream/` deliberately avoids `/api/webhooks/_stream/`. Keep routes flat or use non-underscore names.
16. **Badges go through `components/badge.tsx`.** Six variants (`success | warn | danger | info | accent | muted`), two sizes (`md | sm`). No new inline `inline-block px-2 py-0.5 rounded border font-mono` pills. Domain-specific wrappers (TransportBadge, KindBadge, etc.) thinly map a value space to a variant and delegate. The connection-state pill in `webhook-tail-live.tsx` is the only deliberate exception (it carries a pulsing colored dot).
17. **CLI scripts in `scripts/` cannot import `lib/*`.** Server-only modules are excluded from Node CLI contexts. CLIs inline their own `stripBom` and SQL helpers; this is the precedent set by `record-session-close.mjs`, `emit-session-cost.mjs`, and `sweep-dispatches.mjs`. When a 5th CLI lands, consolidate to a non-server-only `lib/io-utils.mjs`. **Phase 6 crossed this threshold; Phase 7 deliverable #3 actions it.**

18. **Fail-soft PowerShell adapters: `structured.ok === false` overrides `exit_code === 0`.** `cron.ps1` (and any future runtime adapter) always exits 0 — exit codes are unreliable signal under PowerShell 5.1 + `Start-Process -RedirectStandardOutput`. Real failures are surfaced via the JSON envelope. Consumers (the sweeper today, future spawners tomorrow) MUST honour both signals — exit code AND `structured.ok`. Pattern in `sweep-dispatches.mjs::invokeRuntimeAdapter`.

19. **CLI adapters honour `$env:YIELDE_OPERATOR_DIR` (and `$env:YIELDE_OS_AUDIT_FILE`)** so smokes and evals can run in tmp dirs without touching live operator state. Inline run-log + audit writes inside the adapter — do NOT call `operator.ps1` from a runtime adapter (it hard-codes its operator dir and breaks env overrides). Pattern in `runtimes/cron.ps1::Add-RunEvent` / `Add-AuditEvent`.

20. **`command:` frontmatter is required for `runtime: cron` manifests.** The literal shell line the cron adapter executes via `cmd /c`. `_template.md` documents the contract. `webhook-dispatch-sweep.md` is the canonical example. Other runtimes (claude-subagent, n8n-workflow, mcp-tool) ignore `command:`.

If any future change weakens one of these, propose an explicit ADR-style entry in a brain draft before shipping.
