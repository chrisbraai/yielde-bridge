import type { AdvisorSseEvent } from "@/lib/cockpit/types";

// SSE helpers for the advisor stream. The wire is a single default-event stream of
// `data: <json AdvisorSseEvent>\n\n` frames — the client parses each frame's JSON and switches on
// `.type`. (We use the default `message` event rather than named events so one onmessage handler
// covers every AdvisorSseEvent variant.)

const encoder = new TextEncoder();

export function encodeEvent(ev: AdvisorSseEvent): Uint8Array {
  return encoder.encode(`data: ${JSON.stringify(ev)}\n\n`);
}

// A small comment frame doubles as a keep-alive; SSE clients ignore lines starting with ":".
export function encodeComment(text: string): Uint8Array {
  return encoder.encode(`: ${text}\n\n`);
}

export const SSE_HEADERS: Record<string, string> = {
  "content-type": "text/event-stream; charset=utf-8",
  "cache-control": "no-cache, no-transform",
  "x-accel-buffering": "no",
  connection: "keep-alive",
};
