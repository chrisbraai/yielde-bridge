import { getAdvisorContext } from "@/lib/cockpit/context";
import { runAdvisor } from "@/lib/advisor/runner";
import { encodeEvent, encodeComment, SSE_HEADERS } from "@/lib/advisor/sse";
import type { AdvisorSseEvent } from "@/lib/cockpit/types";

// The advisor chat endpoint. POST { message, sessionId? } -> text/event-stream of AdvisorSseEvents.
//
// The advisor reads autonomously (Read/Glob/Grep/WebSearch) but has NO hands: every side effect is
// surfaced as an `action` proposal that Chris must approve via /api/advisor/confirm. Mutating tools
// are denied at the SDK permission layer (see lib/advisor/runner.ts).

export const runtime = "nodejs"; // SDK spawns the claude CLI subprocess — needs the Node runtime.
export const dynamic = "force-dynamic";

const HEARTBEAT_MS = 15_000;

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "invalid JSON" }, { status: 400 });
  }
  const message = (body as { message?: unknown })?.message;
  const sessionId = (body as { sessionId?: unknown })?.sessionId;
  if (typeof message !== "string" || message.trim().length === 0) {
    return Response.json({ error: "expected { message: string }" }, { status: 400 });
  }
  if (message.length > 32_000) {
    return Response.json({ error: "message too long" }, { status: 400 });
  }
  if (sessionId !== undefined && typeof sessionId !== "string") {
    return Response.json({ error: "sessionId must be a string" }, { status: 400 });
  }

  // Snapshot the live cockpit state up front so it's injected into the advisor's system prompt. A
  // failure here is non-fatal — getAdvisorContext already degrades each slice to a safe default.
  const now = new Date();
  let ctx;
  try {
    ctx = await getAdvisorContext(now);
  } catch (e) {
    // Should not happen (context is allSettled internally), but never let it sink the route.
    ctx = {
      at: now.toISOString(),
      northStar: { goal: "5 paying clients", current: 0, target: 5, dayOf: 0, totalDays: 90, daysLeft: 90 },
      advisor: { directive: null, sprintMove: null, rationale: null, status: "unknown", streak: 0 },
      buildShip: { builtOpen: 0, ready: 0, draft: 0, oldestDays: 0, shippedThisWeek: 0 },
      daysSinceDeploy: null,
      shipStreak: { current: 0, longest: 0, lastDeployDate: null },
      topPrs: [],
      gated: [],
      burnToday: { todayCents: 0, activeSessions: 0 },
      fleetActive: 0,
      errors: [`context: ${e instanceof Error ? e.message : String(e)}`],
    };
  }

  const abort = req.signal;

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let closed = false;
      const send = (ev: AdvisorSseEvent) => {
        if (closed) return;
        try {
          controller.enqueue(encodeEvent(ev));
        } catch {
          closed = true;
        }
      };

      // Keep-alive so intermediaries don't close an idle connection while the model thinks.
      const heartbeat = setInterval(() => {
        if (closed) return;
        try {
          controller.enqueue(encodeComment("hb"));
        } catch {
          closed = true;
        }
      }, HEARTBEAT_MS);

      const onAbort = () => {
        closed = true;
      };
      if (abort.aborted) closed = true;
      else abort.addEventListener("abort", onAbort, { once: true });

      try {
        for await (const ev of runAdvisor({ message, sessionId, ctx, now, signal: abort })) {
          if (closed) break;
          send(ev);
        }
      } catch (e) {
        send({ type: "error", message: e instanceof Error ? e.message : String(e) });
      } finally {
        clearInterval(heartbeat);
        abort.removeEventListener("abort", onAbort);
        if (!closed) {
          try {
            controller.close();
          } catch {
            // already closed
          }
        }
      }
    },
  });

  return new Response(stream, { status: 200, headers: SSE_HEADERS });
}
