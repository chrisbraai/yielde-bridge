import type { GatedSeverity } from "@/lib/cockpit/types";

// Parses ```yielde-action ...``` fenced blocks out of the advisor's assistant text.
//
// Contract taught to the advisor in the system prompt: to DO anything with side effects it must emit
//   <plain-english explanation, may include a "danger: info|warn|danger" line>
//   ```yielde-action
//   <a single shell command>
//   ```
// We extract the command, derive a danger level (explicit `danger:` marker in the lead-in text, else
// a heuristic), and the explanation (the text immediately preceding the block). The raw fenced block
// is STRIPPED from the visible token stream so the client never renders (or can copy) a runnable
// command from the chat body — it only ever sees the structured `action` card.
//
// Because text arrives as streamed deltas, this is a stateful incremental parser: feed each delta in,
// get back the text that is safe to show now plus any actions whose closing fence has arrived. Text
// that might be the start of a fence is held back until we know whether it opens a block.

export type ParsedAction = {
  command: string;
  danger: GatedSeverity;
  explanation: string;
};

const FENCE_OPEN = "```yielde-action";

// Heuristic danger classifier used when the advisor omits an explicit `danger:` marker. Deliberately
// conservative: anything that could mutate prod/infra or delete data lands on the high end. The
// human-in-the-loop confirm gate is the real safety boundary; this only colors the card.
const DANGER_PATTERNS: { re: RegExp; level: GatedSeverity }[] = [
  { re: /\b(rm\s+-rf|rmdir|del\s+|format|mkfs|drop\s+(table|database)|truncate)\b/i, level: "danger" },
  { re: /\b(force|--force|-f\b|reset\s+--hard|push\b|deploy|terraform\s+apply|kubectl\s+delete)\b/i, level: "danger" },
  { re: /\b(prod|production|infisical\s+secrets\s+set|secret-run|ssh)\b/i, level: "danger" },
  { re: /\b(git\s+(commit|merge|rebase|checkout|branch)|npm\s+(install|i|publish)|pnpm|yarn|migrate)\b/i, level: "warn" },
  { re: /\b(mv|cp\s+-r|chmod|chown|kill|stop|restart|systemctl|docker\s+(rm|stop|kill))\b/i, level: "warn" },
];

function classifyDanger(command: string, leadIn: string): GatedSeverity {
  // 1. Explicit marker wins: a line like "danger: warn" anywhere in the explanation lead-in.
  const explicit = /danger\s*:\s*(info|warn|danger)\b/i.exec(leadIn);
  if (explicit) return explicit[1].toLowerCase() as GatedSeverity;
  // 2. Heuristic on the command itself.
  for (const { re, level } of DANGER_PATTERNS) {
    if (re.test(command)) return level;
  }
  return "info";
}

// Pull a short, human explanation from the text preceding the block. Strips a trailing `danger:` line
// (it's surfaced separately) and caps length so a runaway lead-in can't bloat the card.
function deriveExplanation(leadIn: string): string {
  const cleaned = leadIn
    .replace(/^[\s>*-]+/gm, "") // strip markdown list/quote bullets at line starts
    .replace(/danger\s*:\s*(info|warn|danger)\b/gi, "")
    .trim();
  // Take the last paragraph (closest to the block) as the most relevant explanation.
  const paras = cleaned.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
  const chosen = paras.length ? paras[paras.length - 1] : cleaned;
  const oneLine = chosen.replace(/\s+/g, " ").trim();
  return oneLine.length > 600 ? `${oneLine.slice(0, 597)}…` : oneLine;
}

// Parse exactly one fenced block's inner content into a command. We take the first non-empty,
// non-comment line as the command (the contract is "a single shell command"); if the model emitted
// several lines, we join them with " && " defensively but keep it conservative — usually it's one.
function extractCommand(inner: string): string {
  const lines = inner
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && !l.startsWith("#"));
  if (lines.length === 0) return "";
  if (lines.length === 1) return lines[0];
  // Multiple lines: prefer a single joined command but cap to avoid surprises.
  return lines.join(" && ");
}

export class ActionStreamParser {
  // Buffer of text not yet emitted as visible. We hold back the tail when it could be the prefix of
  // a fence opener, and we hold back everything between an open fence and its close.
  private buf = "";
  // Explanation lead-in captured at the moment a fence opens (everything emitted-or-buffered before).
  private leadIn = "";
  private inBlock = false;
  private blockInner = "";

  // Feed a chunk of assistant text. Returns { visible, actions } — `visible` is safe to forward to
  // the client as token events; `actions` are any blocks completed by this chunk.
  push(chunk: string): { visible: string; actions: ParsedAction[] } {
    this.buf += chunk;
    let visible = "";
    const actions: ParsedAction[] = [];

    // Drain the buffer greedily.
    for (;;) {
      if (this.inBlock) {
        const closeIdx = this.buf.indexOf("```");
        if (closeIdx === -1) {
          // Whole buffer is block-interior so far; keep accumulating, emit nothing.
          this.blockInner += this.buf;
          this.buf = "";
          break;
        }
        // Found the closing fence.
        this.blockInner += this.buf.slice(0, closeIdx);
        this.buf = this.buf.slice(closeIdx + 3); // drop the ```
        const command = extractCommand(this.blockInner);
        if (command) {
          actions.push({
            command,
            danger: classifyDanger(command, this.leadIn),
            explanation: deriveExplanation(this.leadIn),
          });
        }
        this.inBlock = false;
        this.blockInner = "";
        this.leadIn = "";
        continue;
      }

      const openIdx = this.buf.indexOf(FENCE_OPEN);
      if (openIdx !== -1) {
        // Everything before the opener is visible; it also forms the explanation lead-in.
        const before = this.buf.slice(0, openIdx);
        visible += before;
        this.leadIn += before;
        this.buf = this.buf.slice(openIdx + FENCE_OPEN.length);
        // Consume the rest of the opener line (anything up to the first newline) — e.g. a stray
        // language tag — so it doesn't leak into the command.
        const nl = this.buf.indexOf("\n");
        if (nl === -1) {
          // Opener arrived but its line isn't complete yet; wait for more input. Re-stash so we can
          // re-detect on the next push. We've already advanced past FENCE_OPEN, so reconstruct it.
          this.buf = FENCE_OPEN + this.buf;
          // Hold: nothing more to emit safely this round.
          break;
        }
        this.buf = this.buf.slice(nl + 1);
        this.inBlock = true;
        this.blockInner = "";
        continue;
      }

      // No fence opener present. Emit everything EXCEPT a trailing tail that could be the start of a
      // fence opener (so we don't leak a partial "```yielde-act..." before we know it's a block).
      const safeLen = safeEmitLength(this.buf);
      const toEmit = this.buf.slice(0, safeLen);
      visible += toEmit;
      this.leadIn += toEmit;
      this.buf = this.buf.slice(safeLen);
      break;
    }

    return { visible, actions };
  }

  // Flush any remaining buffered text at end-of-stream. If a block was left unterminated, we discard
  // its interior (no closing fence => not a valid, runnable proposal) and surface nothing for it.
  flush(): { visible: string } {
    if (this.inBlock) {
      // Unterminated block: drop it. Safer to lose a malformed proposal than to surface a runnable
      // command the model never finished.
      this.inBlock = false;
      this.blockInner = "";
      this.leadIn = "";
      this.buf = "";
      return { visible: "" };
    }
    const visible = this.buf;
    this.buf = "";
    return { visible };
  }
}

// How many leading chars of `s` are safe to emit without risking splitting a fence opener. We hold
// back any trailing substring that is a prefix of FENCE_OPEN (e.g. "```", "```yiel").
function safeEmitLength(s: string): number {
  const maxHold = FENCE_OPEN.length - 1;
  const start = Math.max(0, s.length - maxHold);
  for (let i = start; i < s.length; i++) {
    const tail = s.slice(i);
    if (FENCE_OPEN.startsWith(tail)) {
      return i; // hold from i onward — it might grow into a fence opener.
    }
  }
  return s.length;
}
