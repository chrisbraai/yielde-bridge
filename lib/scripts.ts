import "server-only";
import { readdir, readFile, stat } from "node:fs/promises";
import { join, extname, basename } from "node:path";
import { homedir } from "node:os";

// Scripts live at ~/.claude/scripts/. Each script is a directly-runnable file —
// no LLM in the loop. The Library room surfaces them so the agent can copy a
// runnable command (e.g. `node ~/.claude/scripts/foo.mjs`) and execute via Bash.
//
// Layout (mirrors how Skills/Agents are organised):
//   ~/.claude/scripts/<file>                  → category derived from extension
//   ~/.claude/scripts/<category>/<file>       → explicit category subdirectory
//
// Description discovery: parse a leading comment block. Supports `#`, `//`, and
// `<#  ... #>` (PowerShell). The first `description:` line wins; otherwise the
// first non-shebang, non-empty comment line is used.

export function scriptsRoot(): string {
  if (process.env.YIELDE_SCRIPTS_DIR) return process.env.YIELDE_SCRIPTS_DIR;
  return join(homedir(), ".claude", "scripts");
}

export type ScriptSummary = {
  name: string;
  description: string;
  category: string;
  runtime: ScriptRuntime;
  ext: string;
  command: string;
  path: string;
  bytes: number;
  modified: string;
};

export type ScriptRuntime =
  | "node"
  | "powershell"
  | "python"
  | "shell"
  | "batch"
  | "deno"
  | "bun"
  | "other";

const EXT_TO_RUNTIME: Record<string, ScriptRuntime> = {
  ".mjs": "node",
  ".cjs": "node",
  ".js": "node",
  ".ts": "node",
  ".ps1": "powershell",
  ".psm1": "powershell",
  ".py": "python",
  ".sh": "shell",
  ".bash": "shell",
  ".zsh": "shell",
  ".bat": "batch",
  ".cmd": "batch",
};

const SUPPORTED_EXTS = new Set(Object.keys(EXT_TO_RUNTIME));

function runtimeFor(ext: string): ScriptRuntime {
  return EXT_TO_RUNTIME[ext.toLowerCase()] ?? "other";
}

/** Build the runnable command an LLM would paste into Bash/PowerShell. */
function commandFor(runtime: ScriptRuntime, path: string): string {
  const posix = path.replace(/\\/g, "/");
  switch (runtime) {
    case "node":
      return `node "${posix}"`;
    case "powershell":
      return `pwsh -File "${posix}"`;
    case "python":
      return `python "${posix}"`;
    case "shell":
      return `bash "${posix}"`;
    case "batch":
      return `"${posix}"`;
    case "deno":
      return `deno run --allow-all "${posix}"`;
    case "bun":
      return `bun "${posix}"`;
    default:
      return `"${posix}"`;
  }
}

/**
 * Pull the first useful description out of a leading comment block.
 * Recognises the `description:` key (any case) and falls back to the first
 * comment line that isn't a shebang or a noisy banner.
 */
export function extractDescription(src: string): string {
  const lines = src.split(/\r?\n/).slice(0, 40);
  let inBlock = false;
  const candidates: string[] = [];

  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;
    if (line.startsWith("#!")) continue;

    if (line.startsWith("<#")) { inBlock = true; continue; }
    if (line.endsWith("#>")) { inBlock = false; continue; }
    if (line.startsWith("/*")) { inBlock = true; continue; }
    if (line.endsWith("*/")) { inBlock = false; continue; }

    const stripped = inBlock
      ? line.replace(/^[*#\s]+/, "")
      : line.startsWith("//")
      ? line.slice(2).trim()
      : line.startsWith("#")
      ? line.slice(1).trim()
      : null;

    if (stripped === null) {
      // First non-comment, non-blank line → stop scanning.
      break;
    }
    if (!stripped) continue;

    const kv = stripped.match(/^description\s*[:=]\s*(.+)$/i);
    if (kv) return kv[1].replace(/^["']|["']$/g, "").trim();

    if (!/^[-=*_#]{3,}$/.test(stripped)) {
      candidates.push(stripped);
    }
  }

  return candidates[0] ?? "";
}

async function* walkScripts(root: string): AsyncGenerator<{
  category: string;
  file: string;
  path: string;
}> {
  let entries: string[];
  try {
    entries = await readdir(root);
  } catch {
    return;
  }

  for (const entry of entries) {
    if (entry.startsWith(".") || entry.startsWith("_")) continue;
    if (entry.toLowerCase() === "readme.md") continue;
    const entryPath = join(root, entry);
    let st;
    try { st = await stat(entryPath); } catch { continue; }

    if (st.isFile()) {
      const ext = extname(entry).toLowerCase();
      if (!SUPPORTED_EXTS.has(ext)) continue;
      yield { category: runtimeFor(ext), file: entry, path: entryPath };
      continue;
    }

    if (st.isDirectory()) {
      let sub: string[];
      try { sub = await readdir(entryPath); } catch { continue; }
      for (const f of sub) {
        if (f.startsWith(".") || f.startsWith("_")) continue;
        const ext = extname(f).toLowerCase();
        if (!SUPPORTED_EXTS.has(ext)) continue;
        const filePath = join(entryPath, f);
        let fst;
        try { fst = await stat(filePath); } catch { continue; }
        if (!fst.isFile()) continue;
        yield { category: entry, file: f, path: filePath };
      }
    }
  }
}

export async function listScripts(): Promise<ScriptSummary[]> {
  const root = scriptsRoot();
  const out: ScriptSummary[] = [];

  for await (const entry of walkScripts(root)) {
    let src = "";
    let st;
    try {
      [src, st] = await Promise.all([
        readFile(entry.path, "utf8"),
        stat(entry.path),
      ]);
    } catch {
      continue;
    }

    const ext = extname(entry.file).toLowerCase();
    const runtime = runtimeFor(ext);
    // Keep the extension in the name. Two scripts with the same basename and
    // different extensions (e.g. `foo.mjs` + `foo.ps1`) must remain distinct —
    // they're the React key for the card and the pin identifier.
    const name = basename(entry.file);
    const description = extractDescription(src);

    out.push({
      name,
      description,
      category: entry.category,
      runtime,
      ext,
      command: commandFor(runtime, entry.path),
      path: entry.path,
      bytes: st.size,
      modified: st.mtime.toISOString(),
    });
  }

  out.sort((a, b) => {
    if (a.category !== b.category) return a.category.localeCompare(b.category);
    return a.name.localeCompare(b.name);
  });

  return out;
}
