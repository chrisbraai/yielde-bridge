import "server-only";
import type { RedactionRule } from "./config";

// Redact webhook payloads before persisting body_blob. JSON-aware when possible — falls back to
// raw regex over UTF-8 bytes for non-JSON or partial JSON. Returns a new Buffer plus a flag
// indicating whether any rule matched.

export type RedactionResult = {
  body: Buffer | null;
  applied: boolean;
  notes: string[];
};

const DEFAULT_REPLACEMENT = "[REDACTED]";

// Default-on secret shapes (character-class only, no backslash escapes). Each is high-precision to
// avoid mangling legitimate payloads. Bridge stores webhook bodies at rest, so these run on EVERY
// body even when a webhook has no per-rule config (AGENTS.md rule 2: never store credential values).
const DEFAULT_SECRET_PATTERNS: RegExp[] = [
  /AKIA[0-9A-Z]{16}/g,
  /sk-[A-Za-z0-9]{20,}/g,
  /xox[abprs]-[0-9A-Za-z-]{10,}/g,
  /gh[opsur]_[0-9A-Za-z]{36}/g,
  /github_pat_[0-9A-Za-z_]{20,}/g,
  /[sr]k_live_[0-9A-Za-z]{16,}/g,
  /eyJ[0-9A-Za-z._-]{30,}/g,
  /AIza[0-9A-Za-z._-]{30,}/g,
];

function redactKeyInObject(node: unknown, keyName: string, replacement: string): boolean {
  if (Array.isArray(node)) {
    let touched = false;
    for (const child of node) {
      if (redactKeyInObject(child, keyName, replacement)) touched = true;
    }
    return touched;
  }
  if (node && typeof node === "object") {
    let touched = false;
    const obj = node as Record<string, unknown>;
    for (const k of Object.keys(obj)) {
      if (k === keyName) {
        obj[k] = replacement;
        touched = true;
      } else if (redactKeyInObject(obj[k], keyName, replacement)) {
        touched = true;
      }
    }
    return touched;
  }
  return false;
}

export function redactBody(body: Buffer | null, rules: RedactionRule[] | undefined): RedactionResult {
  if (!body) {
    return { body, applied: false, notes: [] };
  }

  const notes: string[] = [];
  let applied = false;
  let working: Buffer = Buffer.from(body);
  const ruleList = rules ?? [];

  // First pass: try to parse as JSON and apply key-based rules in-place.
  const keyRules = ruleList.filter((r) => r.key);
  if (keyRules.length > 0) {
    try {
      const text = working.toString("utf8");
      const parsed = JSON.parse(text) as unknown;
      let touched = false;
      for (const rule of keyRules) {
        const replacement = rule.replace ?? DEFAULT_REPLACEMENT;
        if (rule.key && redactKeyInObject(parsed, rule.key, replacement)) {
          touched = true;
          notes.push(`key:${rule.key}`);
        }
      }
      if (touched) {
        working = Buffer.from(JSON.stringify(parsed));
        applied = true;
      }
    } catch {
      notes.push("key-rules:non-json-body-skipped");
    }
  }

  // Second pass: explicit per-webhook regex rules.
  const patternRules = ruleList.filter((r) => r.pattern);
  if (patternRules.length > 0) {
    let text = working.toString("utf8");
    for (const rule of patternRules) {
      const replacement = rule.replace ?? DEFAULT_REPLACEMENT;
      try {
        const re = new RegExp(rule.pattern!, "g");
        const before = text;
        text = text.replace(re, replacement);
        if (text !== before) {
          applied = true;
          notes.push(`pattern:${rule.pattern}`);
        }
      } catch (err) {
        notes.push(`pattern:invalid-regex:${(err as Error).message}`);
      }
    }
    working = Buffer.from(text);
  }

  // Final pass (default-on): always scrub high-precision secret shapes over the full body text,
  // whether or not it parsed as JSON and whether or not any per-webhook rule matched.
  {
    let text = working.toString("utf8");
    let touched = false;
    for (const re of DEFAULT_SECRET_PATTERNS) {
      const before = text;
      text = text.replace(re, DEFAULT_REPLACEMENT);
      if (text !== before) touched = true;
    }
    if (touched) {
      applied = true;
      notes.push("default-secret-scan");
      working = Buffer.from(text);
    }
  }

  return { body: working, applied, notes };
}
