import "server-only";
import { spawn } from "node:child_process";

// Executes an approved command for the /confirm route. This runs ONLY commands the advisor route
// already stored by id and that Chris explicitly approved — never an arbitrary client-supplied
// string (the confirm route enforces id-lookup before calling here).
//
// On Windows we run through PowerShell so the advisor's PowerShell-or-bash commands behave like they
// would in Chris's own terminal; elsewhere we use /bin/sh.

const MAX_OUTPUT = 16_000; // chars — cap so a chatty command can't blow up the SSE frame / UI.
const TIMEOUT_MS = 120_000; // 2 min hard wall.

export type ExecResult = {
  ok: boolean;
  output: string;
};

function clamp(s: string): string {
  if (s.length <= MAX_OUTPUT) return s;
  return `${s.slice(0, MAX_OUTPUT)}\n…[output truncated, ${s.length - MAX_OUTPUT} more chars]`;
}

export function runApprovedCommand(command: string): Promise<ExecResult> {
  return new Promise((resolve) => {
    const isWin = process.platform === "win32";
    const file = isWin ? "powershell.exe" : "/bin/sh";
    const args = isWin
      ? ["-NoProfile", "-NonInteractive", "-Command", command]
      : ["-c", command];

    let out = "";
    let err = "";
    let settled = false;
    const finish = (ok: boolean, tail = "") => {
      if (settled) return;
      settled = true;
      const combined = [out, err && `\n[stderr]\n${err}`, tail].filter(Boolean).join("");
      resolve({ ok, output: clamp(combined.trim() || (ok ? "(no output)" : "(no output)")) });
    };

    let child;
    try {
      child = spawn(file, args, {
        cwd: process.cwd(),
        windowsHide: true,
        // Inherit env so PATH/tools resolve, but the command itself should use the secret broker for
        // any secret — we never inject secret values here.
        env: process.env,
      });
    } catch (e) {
      finish(false, `\n[spawn failed] ${e instanceof Error ? e.message : String(e)}`);
      return;
    }

    const timer = setTimeout(() => {
      try {
        child.kill();
      } catch {
        // ignore
      }
      finish(false, `\n[timed out after ${TIMEOUT_MS / 1000}s]`);
    }, TIMEOUT_MS);

    child.stdout?.on("data", (d: Buffer) => {
      out += d.toString();
      if (out.length > MAX_OUTPUT * 2) out = out.slice(0, MAX_OUTPUT * 2);
    });
    child.stderr?.on("data", (d: Buffer) => {
      err += d.toString();
      if (err.length > MAX_OUTPUT) err = err.slice(0, MAX_OUTPUT);
    });
    child.on("error", (e: Error) => {
      clearTimeout(timer);
      finish(false, `\n[exec error] ${e.message}`);
    });
    child.on("close", (code: number | null) => {
      clearTimeout(timer);
      finish(code === 0, code === 0 ? "" : `\n[exit code ${code}]`);
    });
  });
}
