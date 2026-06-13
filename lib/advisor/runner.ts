import "server-only";
import { query, type Options, type PermissionResult, type SDKMessage } from "@anthropic-ai/claude-agent-sdk";
import type { AdvisorSseEvent } from "@/lib/cockpit/types";
import type { AdvisorContext } from "@/lib/cockpit/context";
import { buildAdvisorSystemPrompt } from "./system-prompt";
import { ActionStreamParser } from "./action-parser";
import { putAction } from "./store";

// The read-only tool whitelist the advisor may run WITHOUT a prompt. Everything else is denied.
// Note Grep/Glob are listed both in `tools` (so native builds expose them) and `allowedTools`.
const READ_TOOLS = ["Read", "Glob", "Grep", "WebSearch"] as const;
const READ_TOOL_SET = new Set<string>(READ_TOOLS);

// Tools with HANDS — explicitly removed from the model's context so the advisor can't even consider
// them, on top of the canUseTool deny below. WebFetch is excluded too: it can reach arbitrary URLs
// (mild SSRF / exfil surface); we keep the advisor to WebSearch for grounding.
const DENIED_TOOLS = [
  "Bash",
  "Edit",
  "Write",
  "MultiEdit",
  "NotebookEdit",
  "Agent",
  "Task",
  "WebFetch",
  "KillShell",
  "BashOutput",
];

// One-line, human summary of a read-tool invocation for the `tool` SSE event.
function summarizeTool(name: string, input: Record<string, unknown>): string {
  const s = (k: string) => (typeof input[k] === "string" ? (input[k] as string) : undefined);
  switch (name) {
    case "Read":
      return `read ${s("file_path") ?? "a file"}`;
    case "Glob":
      return `glob ${s("pattern") ?? ""}`.trim();
    case "Grep":
      return `grep ${s("pattern") ?? ""}${s("path") ? ` in ${s("path")}` : ""}`.trim();
    case "WebSearch":
      return `web search: ${s("query") ?? ""}`.trim();
    default:
      return name;
  }
}

// Deny callback: the hard gate. Anything not in the read whitelist is refused with a clear message
// so the model understands it must PROPOSE side effects instead of running them.
const canUseTool = async (toolName: string): Promise<PermissionResult> => {
  if (READ_TOOL_SET.has(toolName)) {
    return { behavior: "allow", updatedInput: {} };
  }
  return {
    behavior: "deny",
    message:
      "Denied: the advisor is read-only. To perform a side effect, propose it as a `yielde-action` block for Chris to approve — do not call this tool.",
  };
};

// Narrow a streamed BetaRawMessageStreamEvent down to a text delta without importing the deep beta
// types. We only care about content_block_delta / text_delta here.
function textDeltaOf(ev: unknown): string | null {
  if (!ev || typeof ev !== "object") return null;
  const e = ev as { type?: unknown; delta?: { type?: unknown; text?: unknown } };
  if (e.type !== "content_block_delta") return null;
  if (!e.delta || e.delta.type !== "text_delta") return null;
  return typeof e.delta.text === "string" ? e.delta.text : null;
}

export type RunAdvisorParams = {
  message: string;
  sessionId?: string;
  ctx: AdvisorContext;
  now: Date;
  signal: AbortSignal;
};

// Drives one advisor turn and yields typed AdvisorSseEvents. The route just serializes whatever this
// yields onto the SSE wire. All SDK coupling lives here.
export async function* runAdvisor(
  params: RunAdvisorParams,
): AsyncGenerator<AdvisorSseEvent, void, unknown> {
  const { message, sessionId, ctx, now, signal } = params;

  const abortController = new AbortController();
  const onAbort = () => abortController.abort();
  if (signal.aborted) abortController.abort();
  else signal.addEventListener("abort", onAbort, { once: true });

  const options: Options = {
    // Keep Claude Code's own tool instructions; layer our persona + context on top.
    systemPrompt: {
      type: "preset",
      preset: "claude_code",
      append: buildAdvisorSystemPrompt(ctx, now),
    },
    // Restrict the base toolset to read tools (also forces Grep/Glob on native builds).
    tools: [...READ_TOOLS],
    allowedTools: [...READ_TOOLS],
    disallowedTools: DENIED_TOOLS,
    // Belt-and-suspenders deny gate. `default` mode + this callback => no interactive prompts can
    // hang the headless server route; anything not pre-allowed is denied outright.
    permissionMode: "default",
    canUseTool,
    includePartialMessages: true,
    maxTurns: 24,
    abortController,
    // Run in the bridge project dir so Read/Glob/Grep resolve against the right tree.
    cwd: process.cwd(),
  };
  if (sessionId) options.resume = sessionId;

  const parser = new ActionStreamParser();
  let emittedSession = false;
  let sawText = false;

  try {
    const q = query({ prompt: message, options });

    for await (const msg of q as AsyncGenerator<SDKMessage>) {
      if (abortController.signal.aborted) break;

      // Surface the resumable session id as early as possible (init carries it).
      if (!emittedSession && "session_id" in msg && msg.session_id) {
        emittedSession = true;
        yield { type: "session", sessionId: msg.session_id };
      }

      switch (msg.type) {
        case "stream_event": {
          const text = textDeltaOf(msg.event);
          if (text) {
            sawText = true;
            const { visible, actions } = parser.push(text);
            if (visible) yield { type: "token", text: visible };
            for (const a of actions) {
              const stored = putAction(a);
              yield {
                type: "action",
                id: stored.id,
                command: stored.command,
                danger: stored.danger,
                explanation: stored.explanation,
              };
            }
          }
          break;
        }

        case "assistant": {
          // Emit a `tool` event for each read tool the model invokes. (Text content is handled via
          // stream_event deltas above to avoid double-emitting.)
          const blocks = Array.isArray(msg.message?.content) ? msg.message.content : [];
          for (const block of blocks) {
            const b = block as { type?: string; name?: string; input?: Record<string, unknown> };
            if (b.type === "tool_use" && b.name && READ_TOOL_SET.has(b.name)) {
              yield { type: "tool", name: b.name, summary: summarizeTool(b.name, b.input ?? {}) };
            }
          }
          // Surface a hard auth failure clearly instead of letting it look like an empty answer.
          if (msg.error === "authentication_failed" || msg.error === "oauth_org_not_allowed") {
            yield {
              type: "error",
              message:
                "Claude Code auth failed. Run `claude setup-token` in a terminal and set CLAUDE_CODE_OAUTH_TOKEN, then restart the Bridge dev server.",
            };
          }
          break;
        }

        case "result": {
          // Flush any tail of buffered visible text, then close out the turn.
          const { visible } = parser.flush();
          if (visible) yield { type: "token", text: visible };

          if (msg.subtype === "success") {
            yield { type: "done", costUsd: msg.total_cost_usd };
          } else {
            const detail = msg.errors?.join("; ") || msg.subtype;
            yield { type: "error", message: `Advisor run ended: ${detail}` };
          }
          return;
        }

        default:
          // Ignore the many other system/status message variants.
          break;
      }
    }

    // Stream ended without a result message (e.g. aborted). Flush and finish gracefully.
    const { visible } = parser.flush();
    if (visible) yield { type: "token", text: visible };
    if (!sawText && !abortController.signal.aborted) {
      yield {
        type: "error",
        message:
          "No response from the advisor. If this persists, check Claude Code auth: run `claude setup-token` and set CLAUDE_CODE_OAUTH_TOKEN.",
      };
    }
    yield { type: "done" };
  } catch (err) {
    const m = err instanceof Error ? err.message : String(err);
    // Common shapes: spawn failure (CLI not found) or auth rejection bubbling up as an exception.
    const authish = /auth|oauth|401|unauthor|token|login/i.test(m);
    yield {
      type: "error",
      message: authish
        ? `Advisor auth/launch error: ${m}. Run \`claude setup-token\` and set CLAUDE_CODE_OAUTH_TOKEN, then restart the dev server.`
        : `Advisor error: ${m}`,
    };
  } finally {
    signal.removeEventListener("abort", onAbort);
  }
}
