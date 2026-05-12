import "server-only";
import { readFile, stat } from "node:fs/promises";

// PowerShell defaults to writing UTF-8 with BOM for `Out-File -Encoding utf8`. JSON.parse rejects
// the BOM (U+FEFF), and a try/catch fallback then silently returns an empty value. Every JSON
// reader under lib/ must strip the BOM. Centralized here so the rule lives in one place.

export function stripBom(s: string): string {
  return s.charCodeAt(0) === 0xfeff ? s.slice(1) : s;
}

/**
 * Read a JSON file, returning `fallback` on any error (missing file, not a regular file,
 * malformed JSON). Strips a leading UTF-8 BOM before parsing.
 */
export async function readJsonOrDefault<T>(path: string, fallback: T): Promise<T> {
  try {
    const st = await stat(path);
    if (!st.isFile()) return fallback;
    const src = stripBom(await readFile(path, "utf8"));
    return JSON.parse(src) as T;
  } catch {
    return fallback;
  }
}

/**
 * Read a JSON file. Strips a leading UTF-8 BOM before parsing. Errors propagate to the caller —
 * use this when you need to distinguish "not there yet" (ENOENT) from "malformed".
 */
export async function readJsonStrict<T>(path: string): Promise<T> {
  const src = stripBom(await readFile(path, "utf8"));
  return JSON.parse(src) as T;
}
