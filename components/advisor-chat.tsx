"use client";

import { useCallback, useEffect, useRef, useState } from "react";

// Self-contained advisor chat. No imports from app/cockpit/* (the cockpit UI is built in parallel by
// another agent). Streams from POST /api/advisor (text/event-stream of AdvisorSseEvent JSON frames),
// renders streaming assistant text, surfaces `action` proposals as approve/dismiss cards that POST to
// /api/advisor/confirm, and persists the resumable sessionId across turns for multi-turn chat.
//
// Wire types are mirrored locally (not imported) to keep this component dependency-free and portable.

type Danger = "info" | "warn" | "danger";

type AdvisorEvent =
  | { type: "session"; sessionId: string }
  | { type: "token"; text: string }
  | { type: "tool"; name: string; summary: string }
  | { type: "action"; id: string; command: string; danger: Danger; explanation: string }
  | { type: "action-result"; id: string; ok: boolean; output: string }
  | { type: "done"; costUsd?: number }
  | { type: "error"; message: string };

type ToolNote = { name: string; summary: string };

type ActionCard = {
  id: string;
  command: string;
  danger: Danger;
  explanation: string;
  state: "pending" | "running" | "approved" | "dismissed";
  result?: { ok: boolean; output: string };
};

type ChatMessage =
  | { role: "user"; id: string; text: string }
  | {
      role: "assistant";
      id: string;
      text: string;
      tools: ToolNote[];
      actions: ActionCard[];
      streaming: boolean;
      error?: string;
      costUsd?: number;
    };

const DANGER_STYLE: Record<Danger, { ring: string; chip: string; label: string }> = {
  info: { ring: "border-blue-700/50", chip: "bg-blue-900/30 text-blue-300 border-blue-700/50", label: "info" },
  warn: { ring: "border-amber-700/50", chip: "bg-amber-900/30 text-amber-300 border-amber-700/50", label: "review" },
  danger: { ring: "border-rose-700/60", chip: "bg-rose-900/30 text-rose-300 border-rose-700/60", label: "danger" },
};

function uid(): string {
  return `m_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

export type AdvisorChatProps = {
  // Optional short hint shown as the empty-state subtitle / passed nowhere else. Component works
  // standalone with no props.
  contextHint?: string;
};

export function AdvisorChat({ contextHint }: AdvisorChatProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const sessionIdRef = useRef<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Auto-scroll to the latest content as it streams.
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages]);

  // Tidy up any in-flight stream on unmount.
  useEffect(() => {
    return () => abortRef.current?.abort();
  }, []);

  const patchAssistant = useCallback(
    (assistantId: string, fn: (m: Extract<ChatMessage, { role: "assistant" }>) => void) => {
      setMessages((prev) =>
        prev.map((m) => {
          if (m.role === "assistant" && m.id === assistantId) {
            const copy = { ...m, tools: [...m.tools], actions: m.actions.map((a) => ({ ...a })) };
            fn(copy);
            return copy;
          }
          return m;
        }),
      );
    },
    [],
  );

  const send = useCallback(async () => {
    const text = input.trim();
    if (!text || busy) return;
    setInput("");
    setBusy(true);

    const userMsg: ChatMessage = { role: "user", id: uid(), text };
    const assistantId = uid();
    const assistantMsg: ChatMessage = {
      role: "assistant",
      id: assistantId,
      text: "",
      tools: [],
      actions: [],
      streaming: true,
    };
    setMessages((prev) => [...prev, userMsg, assistantMsg]);

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const res = await fetch("/api/advisor", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ message: text, sessionId: sessionIdRef.current ?? undefined }),
        signal: controller.signal,
      });

      if (!res.ok || !res.body) {
        const detail = await res.text().catch(() => "");
        patchAssistant(assistantId, (m) => {
          m.streaming = false;
          m.error = `Request failed (${res.status}). ${detail}`.trim();
        });
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";

      // Parse the SSE frame stream: events are separated by a blank line; each `data:` line carries
      // one JSON AdvisorEvent.
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });

        let sepIdx: number;
        while ((sepIdx = buf.indexOf("\n\n")) !== -1) {
          const frame = buf.slice(0, sepIdx);
          buf = buf.slice(sepIdx + 2);
          const dataLines = frame
            .split("\n")
            .filter((l) => l.startsWith("data:"))
            .map((l) => l.slice(5).trim());
          if (dataLines.length === 0) continue; // comment/heartbeat frame
          const json = dataLines.join("\n");
          let ev: AdvisorEvent;
          try {
            ev = JSON.parse(json) as AdvisorEvent;
          } catch {
            continue;
          }
          handleEvent(ev, assistantId);
        }
      }
    } catch (e) {
      if ((e as { name?: string })?.name !== "AbortError") {
        patchAssistant(assistantId, (m) => {
          m.streaming = false;
          m.error = e instanceof Error ? e.message : String(e);
        });
      }
    } finally {
      patchAssistant(assistantId, (m) => {
        m.streaming = false;
      });
      setBusy(false);
      abortRef.current = null;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [input, busy, patchAssistant]);

  const handleEvent = useCallback(
    (ev: AdvisorEvent, assistantId: string) => {
      switch (ev.type) {
        case "session":
          sessionIdRef.current = ev.sessionId;
          break;
        case "token":
          patchAssistant(assistantId, (m) => {
            m.text += ev.text;
          });
          break;
        case "tool":
          patchAssistant(assistantId, (m) => {
            m.tools.push({ name: ev.name, summary: ev.summary });
          });
          break;
        case "action":
          patchAssistant(assistantId, (m) => {
            if (!m.actions.some((a) => a.id === ev.id)) {
              m.actions.push({
                id: ev.id,
                command: ev.command,
                danger: ev.danger,
                explanation: ev.explanation,
                state: "pending",
              });
            }
          });
          break;
        case "action-result":
          patchAssistant(assistantId, (m) => {
            const a = m.actions.find((x) => x.id === ev.id);
            if (a) {
              a.result = { ok: ev.ok, output: ev.output };
              a.state = a.state === "dismissed" ? "dismissed" : "approved";
            }
          });
          break;
        case "done":
          patchAssistant(assistantId, (m) => {
            m.streaming = false;
            m.costUsd = ev.costUsd;
          });
          break;
        case "error":
          patchAssistant(assistantId, (m) => {
            m.streaming = false;
            m.error = ev.message;
          });
          break;
      }
    },
    [patchAssistant],
  );

  // Approve or dismiss an action card (POST to the confirm gate). Updates card state in place.
  const confirmAction = useCallback(
    async (assistantId: string, id: string, approve: boolean) => {
      patchAssistant(assistantId, (m) => {
        const a = m.actions.find((x) => x.id === id);
        if (a) a.state = approve ? "running" : "dismissed";
      });
      try {
        const res = await fetch("/api/advisor/confirm", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ id, approve }),
        });
        const data = (await res.json().catch(() => null)) as
          | { type?: string; ok?: boolean; output?: string }
          | null;
        patchAssistant(assistantId, (m) => {
          const a = m.actions.find((x) => x.id === id);
          if (!a) return;
          if (approve) {
            a.state = "approved";
            a.result = { ok: !!data?.ok, output: data?.output ?? "(no output)" };
          } else {
            a.state = "dismissed";
            a.result = { ok: false, output: data?.output ?? "Dismissed." };
          }
        });
      } catch (e) {
        patchAssistant(assistantId, (m) => {
          const a = m.actions.find((x) => x.id === id);
          if (a) {
            a.state = approve ? "approved" : "dismissed";
            a.result = { ok: false, output: e instanceof Error ? e.message : String(e) };
          }
        });
      }
    },
    [patchAssistant],
  );

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void send();
    }
  };

  return (
    <div className="flex flex-col h-full min-h-0 bg-zinc-950 text-zinc-100">
      {/* Message list */}
      <div ref={scrollRef} className="flex-1 min-h-0 overflow-y-auto px-4 py-4 space-y-4">
        {messages.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center px-6">
            <div className="text-sm text-zinc-300 font-medium">Advisor</div>
            <div className="text-xs text-zinc-500 mt-1 max-w-sm">
              {contextHint ??
                "Your chief of staff. Reads the cockpit live. Anything with hands it proposes — you approve."}
            </div>
          </div>
        ) : (
          messages.map((m) =>
            m.role === "user" ? (
              <div key={m.id} className="flex justify-end">
                <div className="max-w-[85%] rounded-2xl rounded-br-sm bg-zinc-800 px-3.5 py-2 text-sm text-zinc-100 whitespace-pre-wrap break-words">
                  {m.text}
                </div>
              </div>
            ) : (
              <div key={m.id} className="flex flex-col gap-2">
                {/* Tool activity (read-only tools the advisor ran) */}
                {m.tools.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {m.tools.map((t, i) => (
                      <span
                        key={i}
                        className="inline-flex items-center gap-1 rounded border border-zinc-800 bg-zinc-900 px-1.5 py-0.5 text-[10px] font-mono text-zinc-400"
                        title={t.summary}
                      >
                        <span className="text-zinc-500">{t.name}</span>
                        <span className="text-zinc-600 truncate max-w-[220px]">{t.summary}</span>
                      </span>
                    ))}
                  </div>
                )}

                {/* Assistant text */}
                {(m.text || m.streaming) && (
                  <div className="max-w-[92%] text-sm text-zinc-200 whitespace-pre-wrap break-words leading-relaxed">
                    {m.text}
                    {m.streaming && (
                      <span className="inline-block w-1.5 h-3.5 ml-0.5 align-middle bg-zinc-500 animate-pulse" />
                    )}
                  </div>
                )}

                {/* Action proposal cards */}
                {m.actions.map((a) => {
                  const ds = DANGER_STYLE[a.danger];
                  return (
                    <div
                      key={a.id}
                      className={`max-w-[92%] rounded-lg border ${ds.ring} bg-zinc-900/60 overflow-hidden`}
                    >
                      <div className="px-3 py-2 flex items-center gap-2 border-b border-zinc-800">
                        <span
                          className={`inline-block rounded border px-1.5 py-0.5 text-[10px] font-mono uppercase tracking-wide ${ds.chip}`}
                        >
                          {ds.label}
                        </span>
                        <span className="text-xs text-zinc-400">proposed action</span>
                        {a.state === "running" && (
                          <span className="text-[10px] text-zinc-500 font-mono ml-auto animate-pulse">
                            running…
                          </span>
                        )}
                      </div>
                      {a.explanation && (
                        <div className="px-3 py-2 text-xs text-zinc-300 leading-relaxed">
                          {a.explanation}
                        </div>
                      )}
                      <pre className="px-3 pb-2 text-xs font-mono text-zinc-200 whitespace-pre-wrap break-all">
                        <span className="text-zinc-600 select-none">$ </span>
                        {a.command}
                      </pre>

                      {a.state === "pending" ? (
                        <div className="px-3 py-2 flex gap-2 border-t border-zinc-800 bg-zinc-950/40">
                          <button
                            type="button"
                            onClick={() => void confirmAction(m.id, a.id, true)}
                            className="px-3 py-1.5 rounded-md bg-emerald-700/80 hover:bg-emerald-600 text-emerald-50 text-xs font-medium transition-colors"
                          >
                            Approve &amp; Run
                          </button>
                          <button
                            type="button"
                            onClick={() => void confirmAction(m.id, a.id, false)}
                            className="px-3 py-1.5 rounded-md border border-zinc-700 hover:border-zinc-600 hover:bg-zinc-800 text-zinc-300 text-xs font-medium transition-colors"
                          >
                            Dismiss
                          </button>
                        </div>
                      ) : (
                        <div className="px-3 py-1.5 border-t border-zinc-800 bg-zinc-950/40 text-[10px] font-mono text-zinc-500 uppercase tracking-wide">
                          {a.state === "running"
                            ? "running"
                            : a.state === "dismissed"
                              ? "dismissed"
                              : a.result?.ok
                                ? "ran — ok"
                                : "ran — failed"}
                        </div>
                      )}

                      {a.result && a.state !== "pending" && a.state !== "running" && (
                        <pre
                          className={`px-3 py-2 text-[11px] font-mono whitespace-pre-wrap break-all border-t border-zinc-800 max-h-64 overflow-y-auto ${
                            a.result.ok ? "text-zinc-300" : "text-rose-300/90"
                          }`}
                        >
                          {a.result.output}
                        </pre>
                      )}
                    </div>
                  );
                })}

                {/* Error / cost footer */}
                {m.error && (
                  <div className="max-w-[92%] rounded-md border border-rose-800/60 bg-rose-950/30 px-3 py-2 text-xs text-rose-300">
                    {m.error}
                  </div>
                )}
                {typeof m.costUsd === "number" && m.costUsd > 0 && (
                  <div className="text-[10px] font-mono text-zinc-600">
                    ${m.costUsd.toFixed(4)}
                  </div>
                )}
              </div>
            ),
          )
        )}
      </div>

      {/* Input */}
      <div className="border-t border-zinc-800 bg-zinc-950 px-3 py-3">
        <div className="flex items-end gap-2">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={onKeyDown}
            rows={1}
            placeholder="Ask your chief of staff…"
            disabled={busy}
            className="flex-1 resize-none rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:border-zinc-600 disabled:opacity-60 max-h-40"
          />
          <button
            type="button"
            onClick={() => void send()}
            disabled={busy || input.trim().length === 0}
            className="px-3.5 py-2 rounded-lg bg-zinc-100 text-zinc-900 text-sm font-medium hover:bg-white disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            {busy ? "…" : "Send"}
          </button>
        </div>
        <div className="mt-1.5 text-[10px] text-zinc-600 font-mono">
          reads autonomously · actions need your approval · Enter to send, Shift+Enter for newline
        </div>
      </div>
    </div>
  );
}

export default AdvisorChat;
