import { claimForRun, rejectAction, markConsumed, getAction } from "@/lib/advisor/store";
import { runApprovedCommand } from "@/lib/advisor/exec";
import type { AdvisorSseEvent } from "@/lib/cockpit/types";

// The "say-so" gate. POST { id, approve }.
//
// SAFETY: this NEVER executes a client-supplied command. It only looks up a command the advisor
// route previously stored under `id` (a server-minted opaque id) and, on approve, runs THAT. An
// unknown id, an already-consumed id, or a by-value command is rejected. Single-user/local tool.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function actionResult(id: string, ok: boolean, output: string): AdvisorSseEvent {
  return { type: "action-result", id, ok, output };
}

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "invalid JSON" }, { status: 400 });
  }
  const id = (body as { id?: unknown })?.id;
  const approve = (body as { approve?: unknown })?.approve;
  if (typeof id !== "string" || id.length === 0 || id.length > 64) {
    return Response.json({ error: "expected { id: string }" }, { status: 400 });
  }
  if (typeof approve !== "boolean") {
    return Response.json({ error: "expected { approve: boolean }" }, { status: 400 });
  }
  // Reject anything that looks like a by-value command smuggled in as the id.
  if (!/^act_[a-z0-9_]+$/i.test(id)) {
    return Response.json({ error: "unknown action id" }, { status: 404 });
  }

  if (!approve) {
    const existed = rejectAction(id);
    // Idempotent-ish: if the id is unknown or already terminal, still report a clean dismissal.
    return Response.json(
      actionResult(id, false, existed ? "Dismissed." : "Already dismissed or expired."),
    );
  }

  // Approve path: atomically claim the pending action so a double-click can't run it twice.
  const action = claimForRun(id);
  if (!action) {
    const known = getAction(id);
    const reason = !known
      ? "Unknown or expired action id."
      : known.status === "consumed" || known.status === "approved"
        ? "This action was already run."
        : known.status === "rejected"
          ? "This action was dismissed."
          : "Action is not runnable.";
    return Response.json(actionResult(id, false, reason), { status: known ? 409 : 404 });
  }

  try {
    const res = await runApprovedCommand(action.command);
    markConsumed(id);
    return Response.json(actionResult(id, res.ok, res.output));
  } catch (e) {
    markConsumed(id);
    return Response.json(
      actionResult(id, false, `Execution error: ${e instanceof Error ? e.message : String(e)}`),
    );
  }
}
