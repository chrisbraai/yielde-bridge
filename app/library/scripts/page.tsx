import { listScripts, type ScriptRuntime } from "@/lib/scripts";
import { readPins } from "@/lib/pins";
import { LibraryList, type LibraryItem } from "@/components/library-list";
import type { BadgeVariant } from "@/components/badge";

export const dynamic = "force-dynamic";

const RUNTIME_VARIANT: Record<ScriptRuntime, BadgeVariant> = {
  node: "success",
  powershell: "info",
  python: "accent",
  shell: "muted",
  batch: "warn",
  deno: "info",
  bun: "success",
  other: "muted",
};

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

export default async function LibraryScriptsPage() {
  const [scripts, pins] = await Promise.all([listScripts(), readPins()]);
  const pinned = new Set(pins.scripts);

  const items: LibraryItem[] = scripts.map((s) => {
    const badges: LibraryItem["badges"] = [];
    badges.push({
      label: s.runtime,
      variant: RUNTIME_VARIANT[s.runtime] ?? "muted",
      title: "runtime",
    });
    badges.push({ label: formatBytes(s.bytes), variant: "muted", title: "size" });
    return {
      name: s.name,
      description: s.description,
      category: s.category,
      pinned: pinned.has(s.name),
      badges,
      copyText: s.command,
      removePath: s.path,
    };
  });

  return (
    <div>
      <header className="mb-6">
        <h1 className="text-xl font-semibold text-zinc-100">Scripts</h1>
        <p className="text-sm text-zinc-500 mt-1">
          Deterministic scripts in <code className="text-zinc-400 text-xs">~/.claude/scripts/</code>
          {" — "}no LLM in the loop. Click a card to copy a runnable command;
          click the pin to lock it to the top of its column.
        </p>
      </header>
      <LibraryList
        items={items}
        kind="script"
        emptyHint="No scripts found. Drop an executable file into ~/.claude/scripts/ (.mjs, .ps1, .py, .sh, …)."
      />
    </div>
  );
}
