import type { NextRequest } from "next/server";
import {
  listRecentWebhookDeliveries,
  listWebhookDeliveriesSince,
  maxWebhookDeliveryId,
  type WebhookDelivery,
} from "@/lib/runtime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Lightweight SSE tail. Client subscribes; we poll runtime.db at ~1Hz and emit any row with
// `id > lastSentId`. better-sqlite3 is sync and fast (~0.1ms per query on a small table),
// so polling is acceptable for the volumes Bridge will ever see locally. If we ever hit a
// remote DB or large tables, swap this for a SQLite-side trigger + better-sqlite3 wal hooks.

const POLL_MS = 1000;
const HEARTBEAT_MS = 15_000;

function sseEncode(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

function shape(d: WebhookDelivery) {
  return {
    id: d.id,
    slug: d.slug,
    received_at: d.received_at,
    source_ip: d.source_ip,
    payload_hash: d.payload_hash,
    status: d.status,
    http_code: d.http_code,
    reason: d.reason,
    dispatch_status: d.dispatch_status,
    dispatch_target: d.dispatch_target,
    dispatch_run_id: d.dispatch_run_id,
    dispatched_at: d.dispatched_at,
    dispatch_log: d.dispatch_log,
    redaction_applied: d.redaction_applied,
  };
}

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const seedParam = url.searchParams.get("seed");
  const seedCount = Math.min(Math.max(seedParam ? parseInt(seedParam, 10) || 0 : 25, 0), 100);

  const encoder = new TextEncoder();
  const abort = req.signal;

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      let closed = false;
      let lastId = 0;

      const send = (event: string, data: unknown) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(sseEncode(event, data)));
        } catch {
          closed = true;
        }
      };

      // Seed with the most-recent rows (oldest first so the client can append).
      const seed = listRecentWebhookDeliveries(seedCount).reverse();
      for (const row of seed) {
        if (row.id > lastId) lastId = row.id;
        send("delivery", shape(row));
      }
      if (lastId === 0) lastId = maxWebhookDeliveryId();
      send("ready", { lastId, seeded: seed.length });

      const poll = setInterval(() => {
        if (closed) return;
        try {
          const rows = listWebhookDeliveriesSince(lastId, 100);
          for (const row of rows) {
            if (row.id > lastId) lastId = row.id;
            send("delivery", shape(row));
          }
        } catch (err) {
          send("error", { message: (err as Error).message });
        }
      }, POLL_MS);

      const heartbeat = setInterval(() => {
        if (closed) return;
        send("heartbeat", { ts: new Date().toISOString(), lastId });
      }, HEARTBEAT_MS);

      const onAbort = () => {
        closed = true;
        clearInterval(poll);
        clearInterval(heartbeat);
        try {
          controller.close();
        } catch {
          // already closed
        }
      };

      if (abort.aborted) onAbort();
      else abort.addEventListener("abort", onAbort, { once: true });
    },
  });

  return new Response(stream, {
    status: 200,
    headers: {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-cache, no-transform",
      "x-accel-buffering": "no",
      connection: "keep-alive",
    },
  });
}
