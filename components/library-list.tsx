"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Badge, type BadgeVariant } from "@/components/badge";

export type LibraryItem = {
  name: string;
  description: string;
  category: string;
  pinned: boolean;
  badges?: Array<{ label: string; variant: BadgeVariant; title?: string }>;
  // Optional override for what gets copied (defaults to `name`). Used by the
  // Scripts tab to copy a runnable command instead of just the script name.
  copyText?: string;
  // Optional route to a detail view. When set, the card shows a "view more"
  // pill in the bottom-right corner.
  detailHref?: string;
  // Full filesystem path for the DELETE API. Agents + scripts pass their path;
  // skills omit it (API reconstructs from category + name).
  removePath?: string;
};

type Kind = "skill" | "agent" | "script";

export function LibraryList({
  items,
  kind,
  emptyHint,
}: {
  items: LibraryItem[];
  kind: Kind;
  emptyHint?: string;
}) {
  const groups = useMemo(() => {
    const map = new Map<string, LibraryItem[]>();
    for (const it of items) {
      const arr = map.get(it.category) ?? [];
      arr.push(it);
      map.set(it.category, arr);
    }
    return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [items]);

  if (items.length === 0) {
    return (
      <div className="border border-zinc-800 rounded-lg p-12 text-center text-zinc-500 text-sm">
        {emptyHint ?? `No ${kind}s found.`}
      </div>
    );
  }

  return (
    <div className="grid gap-4 grid-cols-[repeat(auto-fit,minmax(280px,1fr))]">
      {groups.map(([category, list]) => (
        <LibraryColumn key={category} category={category} items={list} kind={kind} />
      ))}
    </div>
  );
}

function LibraryColumn({
  category,
  items,
  kind,
}: {
  category: string;
  items: LibraryItem[];
  kind: Kind;
}) {
  const [query, setQuery] = useState("");
  const [copied, setCopied] = useState<string | null>(null);
  const [pending, setPending] = useState<Set<string>>(new Set());
  const [confirming, setConfirming] = useState<Set<string>>(new Set());
  const confirmTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const [, startTransition] = useTransition();
  const router = useRouter();

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const matches = q
      ? items.filter(
          (it) =>
            it.name.toLowerCase().includes(q) ||
            it.description.toLowerCase().includes(q)
        )
      : items;
    // Pinned first (alphabetical), then unpinned (alphabetical).
    return [...matches].sort((a, b) => {
      if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
  }, [items, query]);

  async function copy(name: string) {
    try {
      await navigator.clipboard.writeText(name);
      setCopied(name);
      setTimeout(() => setCopied((c) => (c === name ? null : c)), 1200);
    } catch {
      const ta = document.createElement("textarea");
      ta.value = name;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      try {
        document.execCommand("copy");
        setCopied(name);
        setTimeout(() => setCopied((c) => (c === name ? null : c)), 1200);
      } catch {}
      document.body.removeChild(ta);
    }
  }

  async function togglePin(name: string) {
    setPending((prev) => {
      const next = new Set(prev);
      next.add(name);
      return next;
    });
    try {
      const res = await fetch("/api/library/pin", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ kind, name }),
      });
      if (!res.ok) {
        console.error("pin toggle failed", await res.text());
        return;
      }
      startTransition(() => router.refresh());
    } finally {
      setPending((prev) => {
        const next = new Set(prev);
        next.delete(name);
        return next;
      });
    }
  }

  async function removeItem(name: string, removePath?: string) {
    setPending((prev) => { const next = new Set(prev); next.add(name); return next; });
    try {
      const res = await fetch("/api/library/remove", {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ kind, name, category, removePath }),
      });
      if (!res.ok) {
        console.error("remove failed", await res.text());
        return;
      }
      startTransition(() => router.refresh());
    } finally {
      setPending((prev) => { const next = new Set(prev); next.delete(name); return next; });
    }
  }

  function handleRemoveClick(name: string, removePath?: string) {
    if (confirming.has(name)) {
      // Second click — execute
      clearTimeout(confirmTimers.current.get(name));
      confirmTimers.current.delete(name);
      setConfirming((prev) => { const next = new Set(prev); next.delete(name); return next; });
      void removeItem(name, removePath);
    } else {
      // First click — arm the confirm state, auto-reset after 2.5 s
      setConfirming((prev) => { const next = new Set(prev); next.add(name); return next; });
      const t = setTimeout(() => {
        setConfirming((prev) => { const next = new Set(prev); next.delete(name); return next; });
        confirmTimers.current.delete(name);
      }, 2500);
      confirmTimers.current.set(name, t);
    }
  }

  return (
    <section className="flex flex-col border border-zinc-800 rounded-lg bg-zinc-950/40 min-h-0 max-h-[calc(100vh-220px)]">
      <header className="px-3 pt-3 pb-2 border-b border-zinc-800 flex-shrink-0">
        <div className="flex items-baseline gap-2 mb-2">
          <h2 className="text-sm font-semibold text-zinc-100 font-mono">{category}</h2>
          <span className="text-xs text-zinc-500 tabular-nums">
            {filtered.length === items.length
              ? `${items.length}`
              : `${filtered.length} of ${items.length}`}
          </span>
        </div>
        <div className="relative">
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={`Search ${category}…`}
            className="w-full px-2.5 py-1.5 bg-zinc-900 border border-zinc-800 rounded text-xs text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:border-blue-600"
          />
          {query && (
            <button
              type="button"
              aria-label="Clear search"
              onClick={() => setQuery("")}
              className="absolute right-1.5 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-200 text-sm leading-none"
            >
              ×
            </button>
          )}
        </div>
      </header>

      <div className="overflow-y-auto p-2 space-y-1.5 flex-1 min-h-0">
        <CreateCard
          category={category}
          kind={kind}
          copied={copied === createPrompt(kind, category)}
          onCopy={() => copy(createPrompt(kind, category))}
        />
        {filtered.length === 0 ? (
          <div className="text-xs text-zinc-500 px-2 py-6 text-center">
            No matches for “{query}”.
          </div>
        ) : (
          filtered.map((it) => {
            const text = it.copyText ?? it.name;
            return (
              <ItemCard
                key={it.name}
                item={it}
                copied={copied === text}
                pending={pending.has(it.name)}
                confirming={confirming.has(it.name)}
                onCopy={() => copy(text)}
                onTogglePin={() => togglePin(it.name)}
                onRemove={() => handleRemoveClick(it.name, it.removePath)}
              />
            );
          })
        )}
      </div>
    </section>
  );
}

function createPrompt(kind: Kind, category: string): string {
  switch (kind) {
    case "skill":
      return `/skill-create  # category: ${category}`;
    case "agent":
      return `/operator:create  # runtime: ${category}`;
    case "script":
      return `# new ${category} script → ~/.claude/scripts/${category}/`;
  }
}

function CreateCard({
  category,
  kind,
  copied,
  onCopy,
}: {
  category: string;
  kind: Kind;
  copied: boolean;
  onCopy: () => void;
}) {
  const label =
    kind === "skill"
      ? `New ${category} skill`
      : kind === "agent"
      ? `New ${category} agent`
      : `New ${category} script`;
  const command = createPrompt(kind, category);
  return (
    <button
      type="button"
      onClick={onCopy}
      title={`Click to copy “${command}” to clipboard`}
      className={
        "group w-full text-left border border-dashed rounded-md p-2.5 transition-colors " +
        (copied
          ? "border-emerald-700 bg-emerald-900/20"
          : "border-blue-800/60 bg-blue-950/20 hover:bg-blue-950/40 hover:border-blue-700")
      }
    >
      <div className="flex items-center gap-2 mb-1">
        <PlusIcon />
        <span className="font-mono text-xs text-blue-300 group-hover:text-blue-200 truncate">
          {label}
        </span>
        <CopyPill copied={copied} />
      </div>
      <p className="text-[11px] text-zinc-500 leading-snug font-mono truncate">
        {command}
      </p>
    </button>
  );
}

function CopyPill({ copied }: { copied: boolean }) {
  return (
    <span
      aria-live="polite"
      className={
        "ml-auto text-[9px] font-mono px-1 py-0.5 rounded transition-opacity " +
        (copied
          ? "text-emerald-400 bg-emerald-900/40 border border-emerald-700/50 opacity-100"
          : "text-zinc-500 border border-zinc-800 opacity-0 group-hover:opacity-100")
      }
    >
      {copied ? "copied!" : "copy"}
    </span>
  );
}

function PlusIcon() {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      className="text-blue-400"
      aria-hidden="true"
    >
      <path d="M8 3 V13 M3 8 H13" />
    </svg>
  );
}

function ItemCard({
  item,
  copied,
  pending,
  confirming,
  onCopy,
  onTogglePin,
  onRemove,
}: {
  item: LibraryItem;
  copied: boolean;
  pending: boolean;
  confirming: boolean;
  onCopy: () => void;
  onTogglePin: () => void;
  onRemove: () => void;
}) {
  return (
    <div
      className={
        "group relative border rounded-md transition-colors " +
        (item.pinned
          ? "border-amber-700/50 bg-amber-950/10"
          : copied
          ? "border-emerald-700 bg-emerald-900/20"
          : "border-zinc-800 bg-zinc-900/30 hover:bg-zinc-900/60 hover:border-zinc-700")
      }
    >
      <button
        type="button"
        onClick={onCopy}
        title={`Click to copy "${item.copyText ?? item.name}" to clipboard`}
        className={
          "w-full text-left p-2.5 pr-16 cursor-pointer " +
          (item.detailHref ? "pb-7" : "")
        }
      >
        <div className="flex items-center gap-2 mb-1">
          <span className="font-mono text-xs text-zinc-100 group-hover:text-blue-300 truncate">
            {item.name}
          </span>
          <CopyPill copied={copied} />
        </div>
        {item.description && (
          <p className="text-[11px] text-zinc-400 leading-snug line-clamp-3">
            {item.description}
          </p>
        )}
        {item.badges && item.badges.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-1.5">
            {item.badges.map((b) => (
              <Badge key={b.label} variant={b.variant} size="sm" title={b.title}>
                {b.label}
              </Badge>
            ))}
          </div>
        )}
      </button>

      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          if (!pending) onRemove();
        }}
        disabled={pending}
        aria-label={confirming ? `Confirm remove ${item.name}` : `Remove ${item.name}`}
        title={confirming ? "Click again to confirm" : "Remove"}
        className={
          "absolute top-1.5 right-8 w-6 h-6 rounded grid place-items-center transition-all text-sm " +
          (confirming
            ? "text-red-400 bg-red-900/30 border border-red-700/50 opacity-100"
            : "text-zinc-600 opacity-0 group-hover:opacity-100 hover:bg-zinc-800 hover:text-red-400") +
          (pending ? " opacity-50 cursor-wait" : " cursor-pointer")
        }
      >
        ×
      </button>

      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          if (!pending) onTogglePin();
        }}
        disabled={pending}
        aria-pressed={item.pinned}
        aria-label={item.pinned ? `Unpin ${item.name}` : `Pin ${item.name}`}
        title={item.pinned ? "Pinned — click to unpin" : "Pin to top"}
        className={
          "absolute top-1.5 right-1.5 w-6 h-6 rounded grid place-items-center transition-all " +
          (item.pinned
            ? "text-amber-400 bg-amber-900/30 border border-amber-700/50 opacity-100"
            : "text-zinc-500 opacity-0 group-hover:opacity-100 hover:bg-zinc-800 hover:text-zinc-200") +
          (pending ? " opacity-50 cursor-wait" : " cursor-pointer")
        }
      >
        <PinIcon filled={item.pinned} />
      </button>

      {item.detailHref && (
        <Link
          href={item.detailHref}
          title={`Open ${item.name} detail`}
          className="absolute bottom-1.5 right-1.5 text-[10px] font-mono px-1.5 py-0.5 rounded border border-zinc-800 text-zinc-500 bg-zinc-950/60 hover:text-zinc-100 hover:border-zinc-600 hover:bg-zinc-900 transition-colors"
        >
          view more →
        </Link>
      )}
    </div>
  );
}

function PinIcon({ filled }: { filled: boolean }) {
  // Simple pushpin glyph — outline when unpinned, filled when pinned.
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 16 16"
      fill={filled ? "currentColor" : "none"}
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M9.5 1.5 14.5 6.5 11.5 7.5 9 13 3 7 8.5 4.5 9.5 1.5Z" />
      <path d="M3 13 6 10" />
    </svg>
  );
}
