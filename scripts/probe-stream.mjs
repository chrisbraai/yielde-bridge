#!/usr/bin/env node
// Connect to /api/webhooks/_stream, print all SSE events, then exit after `timeoutMs`.
const url = process.argv[2] ?? "http://localhost:3030/api/webhooks/_stream?seed=3";
const timeoutMs = Number(process.argv[3] ?? 5000);

const ctrl = new AbortController();
setTimeout(() => ctrl.abort(), timeoutMs);

try {
  const res = await fetch(url, {
    signal: ctrl.signal,
    headers: { accept: "text/event-stream" },
  });
  console.log("HTTP", res.status, "content-type:", res.headers.get("content-type"));
  if (!res.body) {
    console.log("no body");
    process.exit(0);
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder("utf-8");
  let buf = "";
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    const parts = buf.split("\n\n");
    buf = parts.pop() ?? "";
    for (const block of parts) {
      const lines = block.split("\n").filter(Boolean);
      const ev = { event: "message", data: "" };
      for (const l of lines) {
        if (l.startsWith("event: ")) ev.event = l.slice(7);
        else if (l.startsWith("data: ")) ev.data += l.slice(6);
      }
      console.log(`<${ev.event}> ${ev.data.slice(0, 200)}${ev.data.length > 200 ? "…" : ""}`);
    }
  }
} catch (err) {
  if (err.name !== "AbortError") {
    console.error("stream error:", err.message);
    process.exit(1);
  }
}
