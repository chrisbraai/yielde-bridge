# Yielde Bridge — handoff (post Phase 1)

Last session: 2026-05-12, ended after Phase 1 ship + self-review cleanup. Next session picks up Phase 2 (registries + Configure room panels).

---

## Handoff prompt (paste into a fresh Claude Code session)

> Resume Yielde Bridge Phase 2.
>
> 1. Read `~/.claude/projects/C--Users-chris/memory/project_yielde_bridge.md` for full project state — Phase 0 ✅, Phase 1 ✅ (Hermes import + telemetry + sparklines, 2026-05-12). Memory's "Verification on session resume" section is canonical; run all 4 checks before touching code.
> 2. Read `C:\Users\chris\yielde-bridge\HANDOFF.md` (this file) for Phase 2 plan + open follow-ups.
> 3. Read `C:\Users\chris\yielde-bridge\AGENTS.md` — the project's Next.js 16 / Turbopack / React 19 quirks live there. Heed the "This is NOT the Next.js you know" notice.
> 4. **Do NOT load `~/.claude/CLAUDE.md`'s full brain index unless a task explicitly touches `yielde-platform`, `yielde-site`, a client slug, or co-founder work.** This session is repo-local to `yielde-bridge` and `yielde-skills`. The brain is only touched as a write target via `brain-gatekeeper` rules: `_inbox/` drafts only, never canonical files (`Decisions/`, `Incidents/`, `Staff/`, `Clients/`, `SOPs/`, `Platform/`, `Site/`, `Glossary.md`, `Backlog.md`, `INDEX.md`, `Alignment.excalidraw.md`).
> 5. Start Phase 2: `mcp.json` / `api.json` / `webhook.json` registries in `yielde-bridge-config/` + a `bridge sync` CLI + Configure panels (MCP, API, Webhooks, Secrets, Capabilities). See Phase 2 plan in HANDOFF.md.
> 6. At meaningful milestones, write a draft to `yielde-brain/_inbox/YYYY-MM-DD-HHMM-<slug>.md` per the `brain-gatekeeper` skill schema, commit, and push. Never silent. Never canonical.
>
> Work without stopping to ask clarifying questions when the reasonable call is obvious. Use TaskCreate to track multi-step work.

---

## What just shipped (Phase 1)

| Repo | Commit | Highlights |
|---|---|---|
| `yielde-skills` | `5abadbe` | `scripts/import-hermes.mjs`, 5 seed skills under `skills/hermes/`, INDEX.md regenerated (9 total) |
| `yielde-bridge` | `00a6d30` → `80464bd` | `lib/usage.ts` atomic `.usage.json`, `POST /api/skills/{use,import-hermes}`, `ImportHermesDialog`, `UsageSparkline`, lint cleanup |
| `yielde-brain` | `3b39325` | `_inbox/2026-05-12-1326-yielde-bridge-phase-1-shipped.md` (draft, awaiting `/brain-log promote`) |

`~/.claude/skills/hermes` junction created out-of-band — verify with `Get-ChildItem`.

---

## Phase 2 plan (Configure panels + registries)

**Repo layout decision (locked Phase 0):** all live config lives in private `yielde-bridge-config/` repo. Bridge reads it; never writes it directly. Edits happen via CLI + git.

### Files to land (yielde-bridge-config)

```
yielde-bridge-config/
├── mcp.json           # MCP server endpoints (name, transport, env-ref)
├── api.json           # outbound API connectors (provider, base_url, auth-ref)
├── webhook.json       # inbound webhook routes (slug, target, secret-ref)
├── secret-refs.json   # NEVER values. References into Infisical / OS keychain.
└── capabilities.json  # mirror of ~/.claude/os/capabilities/ for fast UI read
```

Schema sketch (firm them up against `~/.claude/os/capabilities/` real shape before writing types):

```ts
type McpServer = { name: string; transport: "stdio"|"sse"|"http"; command?: string; url?: string; envRefs?: string[] };
type ApiConnector = { name: string; baseUrl: string; authRef: string; rateLimit?: { rpm: number } };
type WebhookRoute = { slug: string; targetSkill: string; secretRef: string; verifySig: "hmac-sha256"|"none" };
type SecretRef = { name: string; provider: "infisical"|"os-keychain"; path: string };  // path, not value
type Capability = { name: string; hardGated: boolean; description: string };
```

### Files to land (yielde-bridge)

1. `lib/config.ts` — reads `yielde-bridge-config/*.json` with the same `force-dynamic` + filesystem-on-render pattern as `lib/skills.ts`. Resolve via env var `YIELDE_BRIDGE_CONFIG_ROOT` falling back to `~/yielde-bridge-config/`.
2. `app/configure/{mcp,api,webhooks,secret-refs,capabilities}/page.tsx` — replace the `PhasePlaceholder` stubs with real listing tables. Same visual language as `/configure/skills` (zinc-950 bg, table, provenance-style badges).
3. `bin/bridge` Node CLI (or `scripts/bridge.mjs`) with subcommands:
   - `bridge sync` — pulls `yielde-bridge-config` to its working tree.
   - `bridge add mcp <name> ...` — writes to `mcp.json` and commits.
   - `bridge add api <name> ...`
   - `bridge add webhook <slug> ...`
   - All edits go through git: append-and-commit, never mutate live config from a server route.

### Hard rules (don't break)

- **Bridge reads, never writes** to `yielde-bridge-config/` from server routes (Phase 0–2 invariant). All mutations go through the CLI + git push.
- **`secret-refs.json` is reference-only.** If a literal token appears, abort and route through Infisical or OS keychain.
- **File-guard pattern** blocks filenames containing `secret`. Stick to `secret-refs.json` (singular `secret` is fine — the guard matches `secrets`).
- **Brain writes** go through `brain-gatekeeper`'s `_inbox/` rules. Never edit canonical paths.

### Verification gate before Phase 2 commit

- `npx tsc --noEmit` clean
- `npx eslint --max-warnings=0 lib/ components/ app/` clean
- `/configure/{mcp,api,webhooks,secret-refs,capabilities}` all render real data, not `PhasePlaceholder`
- `bridge sync` round-trips a known fixture (add → list → remove)
- New brain draft in `_inbox/` describing what shipped, committed and pushed

---

## Open follow-ups from Phase 1 (not blockers)

1. **`parseFrontmatter` triplication.** Three copies: `yielde-bridge/lib/skills.ts` (TS), `yielde-skills/scripts/build-index.mjs` (mjs), `yielde-skills/scripts/import-hermes.mjs` (mjs). Acceptable until a fourth caller appears. If Phase 2's `lib/config.ts` ends up parsing YAML, that's the cue to extract a shared `yielde-skills/lib/frontmatter.mjs`.

2. **`pinned` boolean parsing inconsistency.** `lib/skills.ts` coerces "true"/"false"; `build-index.mjs` does raw string compare. Both work for current data — same fix as #1 would resolve.

3. **Windows libuv shutdown assertion.** Documented in memory under "Critical gotchas." Pattern is encoded in `app/api/skills/import-hermes/route.ts`. Reapply the same `result.code === N || stderr-substring-match` shape to any Phase 2 endpoint that spawns Node scripts.

4. **`/brain-log promote` outstanding for three drafts:**
   - `_inbox/2026-05-12-yielde-bridge-phase-0-kickoff.md` (decision)
   - `_inbox/2026-05-12-yielde-bridge-phase-0-complete.md` (staff-work)
   - `_inbox/2026-05-12-1326-yielde-bridge-phase-1-shipped.md` (staff-work)
   Chris-only action; agent must not promote.

5. **LF/CRLF noise on every Windows commit** — cosmetic. Add `.gitattributes` with `* text=auto eol=lf` to silence if it becomes annoying. Not done yet.

---

## Quick-reference paths

| What | Where |
|---|---|
| Bridge app | `C:\Users\chris\yielde-bridge\` (Next.js 16, `npm run dev` → :3030) |
| Skills repo (public, MIT) | `C:\Users\chris\yielde-skills\` |
| Config repo (private, **don't yet exist files for Phase 2**) | `C:\Users\chris\yielde-bridge-config\` |
| Brain | `C:\Users\chris\yielde-brain\` — write `_inbox/` ONLY |
| Project memory | `~/.claude/projects/C--Users-chris/memory/project_yielde_bridge.md` |
| Hermes upstream | `https://github.com/NousResearch/hermes-agent` (use `gh api` not WebFetch) |
| Junctions | `~/.claude/skills/{yielde,hermes}/` → `yielde-skills/skills/{yielde,hermes}/` |
| Telemetry sidecar | `~/.claude/skills/.usage.json` |

## Smoke tests to run before any Phase 2 work

```bash
# 1. Junctions intact, 9 skills
ls /c/Users/chris/.claude/skills/yielde   # 4 dirs
ls /c/Users/chris/.claude/skills/hermes   # 5 dirs

# 2. Bridge typechecks + lints clean
cd /c/Users/chris/yielde-bridge && npx tsc --noEmit && npx eslint --max-warnings=0 lib/ components/ app/

# 3. Dev server serves 9 skills
npm run dev   # background
curl -sL http://localhost:3030/configure/skills | grep -oE '>(hermes-import|yielde-native)<' | sort | uniq -c
# expect: 5 hermes-import, 4 yielde-native

# 4. Telemetry round-trips
curl -s -X POST -H 'content-type: application/json' -d '{"name":"arxiv"}' http://localhost:3030/api/skills/use
cat /c/Users/chris/.claude/skills/.usage.json
```

If any check fails, diagnose before opening Phase 2.
