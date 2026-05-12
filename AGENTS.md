<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Yielde Bridge — agent notes

## Project shape

- `app/` — three rooms (`configure/`, `run/`, `inspect/`). Each room has its own layout.
- `lib/skills.ts` — server-side reader for `~/.claude/skills/` (the canonical Claude Code skills path). Yielde skills live under `skills/yielde/` via a Windows directory junction to `yielde-skills/skills/yielde/`.
- `lib/markdown.ts` — minimal dependency-free markdown → HTML renderer for SKILL.md bodies. Replace with `marked` / `remark` in Phase 1 if richer rendering is needed.
- `components/` — small, presentational. No data fetching in components — pass props from server pages.

## Rules

1. **Never write to `yielde-brain/` from this app.** Audit-enforced writes are the `brain-gatekeeper` skill's job. Bridge surfaces drafts; it never creates them.
2. **Never store credential values.** `secret-refs.json` holds references only. If you find yourself typing a token literal, abort and route through the OS keychain / Infisical.
3. **Read-only filesystem access only (Phase 0–2).** Bridge writes start in Phase 3 (webhook archive) and use SQLite. Until then, all registry edits go through CLI + git push.
4. **Always `force-dynamic` server pages that read state.** Filesystem changes between requests; static generation would lie.
