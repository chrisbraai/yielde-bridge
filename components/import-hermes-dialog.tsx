"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

export function ImportHermesDialog() {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [force, setForce] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function reset() {
    setInput("");
    setForce(false);
    setError(null);
    setSuccess(null);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    if (!input.trim()) {
      setError("Provide a skill slug, repo:path, or GitHub URL.");
      return;
    }
    try {
      const res = await fetch("/api/skills/import-hermes", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ input: input.trim(), force }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data?.stderr?.trim() || data?.error || `HTTP ${res.status}`);
        return;
      }
      setSuccess(data.output || "Imported.");
      startTransition(() => {
        router.refresh();
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Network error");
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => { reset(); setOpen(true); }}
        className="px-3 py-1.5 text-xs rounded-md border border-emerald-700/50 bg-emerald-900/20 text-emerald-300 hover:bg-emerald-900/40 transition-colors"
      >
        + Import from Hermes URL
      </button>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={() => setOpen(false)}>
      <div
        className="w-full max-w-lg border border-zinc-800 bg-zinc-950 rounded-lg shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <form onSubmit={submit} className="p-5 space-y-4">
          <div>
            <h2 className="text-base font-semibold text-zinc-100">Import Hermes skill</h2>
            <p className="text-xs text-zinc-500 mt-1">
              Accepts a bare slug (searches{" "}
              <code className="text-zinc-400">NousResearch/hermes-agent</code>), a{" "}
              <code className="text-zinc-400">owner/repo:path/SKILL.md</code> form, or a full GitHub URL.
            </p>
          </div>
          <div>
            <label htmlFor="import-input" className="block text-xs text-zinc-400 mb-1">
              Source
            </label>
            <input
              id="import-input"
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="systematic-debugging"
              autoFocus
              className="w-full px-3 py-2 text-sm font-mono bg-zinc-900 border border-zinc-800 rounded text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:border-blue-500"
            />
          </div>
          <label className="flex items-center gap-2 text-xs text-zinc-400 cursor-pointer">
            <input
              type="checkbox"
              checked={force}
              onChange={(e) => setForce(e.target.checked)}
              className="rounded border-zinc-700 bg-zinc-900"
            />
            Overwrite if already imported
          </label>

          {error && (
            <pre className="text-xs text-red-400 bg-red-950/30 border border-red-900/50 rounded p-2 whitespace-pre-wrap max-h-40 overflow-auto">
              {error}
            </pre>
          )}
          {success && (
            <pre className="text-xs text-emerald-400 bg-emerald-950/30 border border-emerald-900/50 rounded p-2 whitespace-pre-wrap">
              {success}
            </pre>
          )}

          <div className="flex items-center justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="px-3 py-1.5 text-xs rounded border border-zinc-800 text-zinc-400 hover:text-zinc-100"
            >
              Close
            </button>
            <button
              type="submit"
              disabled={pending || !input.trim()}
              className="px-3 py-1.5 text-xs rounded border border-emerald-700/50 bg-emerald-900/30 text-emerald-300 hover:bg-emerald-900/60 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              {pending ? "Importing…" : "Import"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
