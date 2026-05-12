// io-utils.mjs — shared Node CLI helpers.
//
// CANONICAL location for parseFrontmatter / stripBom / JSON readers / manifest
// runtime extraction. Lives under lib/ but is intentionally NOT server-only —
// scripts/ CLIs (which cannot import server-only modules) and Next.js server
// pages both depend on these helpers.
//
// Phase 7 deliverable 6c consolidated 7+ inline implementations into this file.
// `lib/skills.ts` keeps its TypeScript parseFrontmatter because the typed
// SkillFrontmatter / SkillSummary surface around it is not worth bending into a
// plain .mjs export — divergence documented in the Phase 7 brain draft.
//
// PowerShell-side parsing (`cron.ps1::Read-Manifest`) deliberately stays
// independent — Node and PowerShell can't share runtime, and the PS impl is
// already the canonical PowerShell pattern.

import { readFile, stat } from "node:fs/promises";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

// ---------- BOM + JSON ----------

// PowerShell defaults to writing UTF-8 with a BOM (EF BB BF). JSON.parse rejects
// the BOM; paired with a try/catch fallback this looks identical to "file empty"
// and silently zeroes downstream state. Strip it at the seam.
export function stripBom(s) {
  return s.charCodeAt(0) === 0xfeff ? s.slice(1) : s;
}

/** Async — read a JSON file, returning `fallback` on any error (missing/malformed/not-file). */
export async function readJsonOrDefault(path, fallback) {
  try {
    const st = await stat(path);
    if (!st.isFile()) return fallback;
    const src = stripBom(await readFile(path, "utf8"));
    return JSON.parse(src);
  } catch {
    return fallback;
  }
}

/** Async — read a JSON file. Errors propagate; use when ENOENT must be distinguished from malformed. */
export async function readJsonStrict(path) {
  const src = stripBom(await readFile(path, "utf8"));
  return JSON.parse(src);
}

/** Sync — read a JSON file with BOM-strip + fallback. CLIs that need sync I/O reach for this. */
export function readJsonOrDefaultSync(path, fallback) {
  try {
    if (!existsSync(path)) return fallback;
    const src = stripBom(readFileSync(path, "utf8"));
    return JSON.parse(src);
  } catch {
    return fallback;
  }
}

// ---------- Frontmatter ----------

// Indentation-aware YAML frontmatter parser: strings, bools, ints, flow arrays,
// block scalars (`|`/`>`/`|-`/`>-`), and one level of nested mappings (sufficient
// for Hermes `metadata.hermes.*` and cron manifests). Not a general YAML parser.
//
// Returns `{ fm, body }`. If frontmatter is absent or malformed, `fm` is `{}`
// and `body` is the full source unchanged — callers may treat that as "no FM".
export function parseFrontmatter(src) {
  const m = src.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!m) return { fm: {}, body: src };
  const lines = m[1].split(/\r?\n/);
  const body = m[2];

  function coerce(val) {
    val = val.replace(/^["']|["']$/g, "");
    if (val === "true") return true;
    if (val === "false") return false;
    if (/^-?\d+$/.test(val)) return parseInt(val, 10);
    return val;
  }

  function parseArray(val) {
    return val
      .slice(1, -1)
      .split(",")
      .map((s) => s.trim().replace(/^["']|["']$/g, ""))
      .filter(Boolean);
  }

  let i = 0;

  function readNode(indent) {
    const out = {};
    while (i < lines.length) {
      const line = lines[i];
      if (!line.trim()) { i++; continue; }
      const leading = line.match(/^(\s*)/)[1].length;
      if (leading < indent) return out;
      if (leading > indent) { i++; continue; }

      const kv = line.slice(indent).match(/^([a-zA-Z_][a-zA-Z0-9_-]*):\s*(.*)$/);
      if (!kv) { i++; continue; }
      const key = kv[1];
      const rawVal = kv[2];

      if (rawVal === "") {
        // Nested mapping
        i++;
        out[key] = readNode(indent + 2);
        continue;
      }

      if (rawVal === "|" || rawVal === ">" || rawVal === "|-" || rawVal === ">-") {
        i++;
        const block = [];
        const blockIndent = indent + 2;
        while (i < lines.length) {
          const bl = lines[i];
          if (bl.trim() === "") { block.push(""); i++; continue; }
          const bLead = bl.match(/^(\s*)/)[1].length;
          if (bLead < blockIndent) break;
          block.push(bl.slice(blockIndent));
          i++;
        }
        out[key] = block.join("\n").trim();
        continue;
      }

      if (rawVal.startsWith("[") && rawVal.endsWith("]")) {
        out[key] = parseArray(rawVal);
        i++;
        continue;
      }

      out[key] = coerce(rawVal);
      i++;
    }
    return out;
  }

  const root = readNode(0);
  return { fm: root, body };
}

// ---------- Operator manifests ----------

/**
 * Read `agents/<target>.md` under the given operator root and return its
 * frontmatter as a flat object, or `null` if the file is missing/malformed.
 *
 * Used by the dispatch sweeper (cron/mcp-tool routing) and any future CLI that
 * needs to know an agent's `runtime:` + `command:` before invoking it.
 */
export function readManifestRuntime(operatorRoot, target) {
  const manifestPath = join(operatorRoot, "agents", `${target}.md`);
  if (!existsSync(manifestPath)) return null;
  let raw;
  try { raw = stripBom(readFileSync(manifestPath, "utf8")); } catch { return null; }
  const { fm } = parseFrontmatter(raw);
  if (!fm || Object.keys(fm).length === 0) return null;
  return fm;
}

// ---------- Process stderr scrubbing ----------

// Windows libuv emits `Assertion failed: !(handle->flags & UV_HANDLE_CLOSING)`
// during child Node shutdown when stderr writes are still in flight. The exit
// code becomes 0xC0000409 but the script's real stderr survives — strip the
// noise before surfacing stderr to UI / run logs / response bodies.
export function stripLibuvNoise(s) {
  if (!s) return s;
  return s
    .split(/\r?\n/)
    .filter((line) => !/Assertion failed:.*UV_HANDLE_CLOSING/.test(line))
    .join("\n");
}
