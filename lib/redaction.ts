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
  if (!body || !rules || rules.length === 0) {
    return { body, applied: false, notes: [] };
  }

  const notes: string[] = [];
  let applied = false;
  let working: Buffer = Buffer.from(body);

  // First pass: try to parse as JSON and apply key-based rules in-place.
  const keyRules = rules.filter((r) => r.key);
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

  // Second pass: regex rules against the (possibly already key-redacted) body.
  const patternRules = rules.filter((r) => r.pattern);
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

  return { body: working, applied, notes };
}
