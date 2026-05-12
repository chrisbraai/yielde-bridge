import "server-only";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { homedir } from "node:os";
import { randomBytes } from "node:crypto";
import { updateDispatch, type DispatchUpdate } from "./runtime";

// Phase 4 dispatch model: webhook receiver enqueues a JSON request file the moment a delivery
// is accepted. An external worker (Phase 5 — a Claude Code session sweeping the queue, or
// /operator deploy) consumes the queue and updates dispatch_status. For the "noop" skill we
// short-circuit and mark succeeded immediately so the smoke test exercises the whole path.

export function dispatchQueueRoot(): string {
  if (process.env.YIELDE_BRIDGE_DISPATCH_QUEUE) return process.env.YIELDE_BRIDGE_DISPATCH_QUEUE;
  return join(homedir(), ".claude", "bridge", "dispatches");
}

export type DispatchRequest = {
  deliveryId: number;
  slug: string;
  targetSkill: string;
  payloadHash: string;
  receivedAt: string;
  bodyPath: string | null;
  bodyBytes: number;
};

function makeRunId(): string {
  const now = new Date();
  const stamp =
    `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}-` +
    `${String(now.getUTCDate()).padStart(2, "0")}-` +
    `${String(now.getUTCHours()).padStart(2, "0")}${String(now.getUTCMinutes()).padStart(2, "0")}`;
  return `${stamp}-${randomBytes(2).toString("hex")}`;
}

async function writeQueueFile(req: DispatchRequest, runId: string): Promise<string> {
  const dir = join(dispatchQueueRoot(), req.slug);
  await mkdir(dir, { recursive: true });
  const path = join(dir, `${runId}.json`);
  const payload = {
    schema_version: "1.0",
    enqueued_at: new Date().toISOString(),
    run_id: runId,
    delivery_id: req.deliveryId,
    slug: req.slug,
    target_skill: req.targetSkill,
    payload_hash: req.payloadHash,
    received_at: req.receivedAt,
    body_path: req.bodyPath,
    body_bytes: req.bodyBytes,
  };
  await writeFile(path, JSON.stringify(payload, null, 2), "utf8");
  return path;
}

/**
 * Run the dispatch for an accepted webhook delivery. Returns the final DispatchUpdate so the
 * caller can also surface it in the API response.
 */
export async function dispatchAcceptedDelivery(req: DispatchRequest): Promise<DispatchUpdate> {
  const runId = makeRunId();
  const dispatchedAt = new Date().toISOString();

  if (req.targetSkill === "noop") {
    const update: DispatchUpdate = {
      id: req.deliveryId,
      status: "succeeded",
      target: req.targetSkill,
      runId,
      dispatchedAt,
      log: "noop target — accepted without external invocation",
    };
    updateDispatch(update);
    return update;
  }

  try {
    const path = await writeQueueFile(req, runId);
    const update: DispatchUpdate = {
      id: req.deliveryId,
      status: "queued",
      target: req.targetSkill,
      runId,
      dispatchedAt,
      log: `queued at ${path}`,
    };
    updateDispatch(update);
    return update;
  } catch (err) {
    const update: DispatchUpdate = {
      id: req.deliveryId,
      status: "failed",
      target: req.targetSkill,
      runId,
      dispatchedAt,
      log: `queue write failed: ${(err as Error).message}`,
    };
    updateDispatch(update);
    return update;
  }
}
