import { spawn } from "node:child_process";
import { join } from "node:path";
import { homedir } from "node:os";

export const dynamic = "force-dynamic";

const SCRIPT_PATH = join(homedir(), "yielde-skills", "scripts", "import-hermes.mjs");
const SCRIPT_CWD = join(homedir(), "yielde-skills");

function isSafeInput(input: string): boolean {
  if (input.length > 500) return false;
  // Allow either a bare slug (a-zA-Z0-9_-), a repo:path form, or a https URL
  if (/^[a-zA-Z0-9_-]+$/.test(input)) return true;
  if (/^[a-zA-Z0-9_-]+\/[a-zA-Z0-9_.-]+:[\w./-]+$/.test(input)) return true;
  if (/^https:\/\/[^\s'"`;|&$]+$/.test(input)) return true;
  return false;
}

function runImporter(input: string, force: boolean): Promise<{ ok: boolean; code: number; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    const args = [SCRIPT_PATH, input];
    if (force) args.push("--force");
    const proc = spawn(process.execPath, args, { cwd: SCRIPT_CWD });
    let stdout = "";
    let stderr = "";
    proc.stdout.on("data", (d) => { stdout += d.toString(); });
    proc.stderr.on("data", (d) => { stderr += d.toString(); });
    proc.on("close", (code) => {
      resolve({ ok: code === 0, code: code ?? -1, stdout, stderr });
    });
  });
}

export async function POST(request: Request) {
  let body: { input?: unknown; force?: unknown };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "invalid JSON" }, { status: 400 });
  }
  const input = body?.input;
  if (typeof input !== "string" || !isSafeInput(input)) {
    return Response.json({ error: "invalid `input` (slug, repo:path, or https URL required)" }, { status: 400 });
  }
  const force = body?.force === true;
  const result = await runImporter(input, force);
  if (!result.ok) {
    const alreadyImported =
      result.code === 2 || /^already imported:/m.test(result.stderr);
    // Strip Windows libuv shutdown assertion noise — the script's real message
    // (e.g. "already imported: …") survives this filter.
    const cleanedStderr = result.stderr
      .replace(/^Assertion failed:.*$/gm, "")
      .replace(/\r?\n+/g, "\n")
      .trim();
    return Response.json(
      { error: "import failed", code: result.code, stdout: result.stdout, stderr: cleanedStderr },
      { status: alreadyImported ? 409 : 500 }
    );
  }
  return Response.json({ ok: true, output: result.stdout.trim() });
}
