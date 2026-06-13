import type { ReactNode } from "react";
import { Kicker } from "./primitives";

// ── ScrollRail: a horizontal, momentum-scrolling rail of chips with soft fade edges ─────────────
//
// This is "the scrollbars" Chris asked for: one rail per Library facet (Skills / Agents / Scripts /
// Capabilities). Pure server markup — horizontal scroll is CSS-only (`overflow-x-auto`), so ~180
// skill chips scroll smoothly with no client JS. The fade edges are absolutely-positioned gradient
// overlays (pointer-events-none) that hint "there's more →" without a visible scrollbar fighting the
// dark canvas. The native scrollbar is thinned via the shared `.rail-scroll` utility (globals.css);
// even if that utility is absent the rail still scrolls — the fades are the primary affordance.

export function ScrollRail({
  title,
  count,
  hint,
  children,
  empty,
}: {
  title: string;
  count: number;
  hint?: ReactNode;
  children: ReactNode;
  /** rendered (instead of children) when count === 0 — keeps empty states honest. */
  empty?: ReactNode;
}) {
  return (
    <section className="flex min-w-0 flex-col gap-2">
      <header className="flex shrink-0 items-baseline justify-between px-0.5">
        <div className="flex items-baseline gap-2">
          <Kicker>{title}</Kicker>
          <span className="font-mono text-[10px] tabular-nums text-zinc-600">{count}</span>
        </div>
        {hint != null && (
          <span className="font-mono text-[10px] text-zinc-700">{hint}</span>
        )}
      </header>

      <div className="relative min-w-0">
        {/* left + right fade edges — the "there's more" cue */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-y-0 left-0 z-10 w-8 bg-gradient-to-r from-zinc-950 to-transparent"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute inset-y-0 right-0 z-10 w-10 bg-gradient-to-l from-zinc-950 to-transparent"
        />

        {count === 0 && empty != null ? (
          <div className="rounded-lg border border-dashed border-zinc-800/80 px-3 py-3 text-center font-mono text-[11px] text-zinc-600">
            {empty}
          </div>
        ) : (
          <div className="rail-scroll flex gap-1.5 overflow-x-auto scroll-smooth px-1 pb-2 [scrollbar-width:thin]">
            {children}
          </div>
        )}
      </div>
    </section>
  );
}

// ── Chip: a single compact rail item. Optionally a link (skills → detail route). ────────────────

export function Chip({
  label,
  sub,
  title,
  href,
  tone = "default",
}: {
  label: ReactNode;
  sub?: ReactNode;
  title?: string;
  href?: string;
  tone?: "default" | "accent" | "good" | "muted";
}) {
  const toneRing: Record<string, string> = {
    default: "border-zinc-800/80 bg-zinc-900/50 hover:border-zinc-700 hover:bg-zinc-900",
    accent: "border-blue-800/40 bg-blue-950/20 hover:border-blue-700/60 hover:bg-blue-950/35",
    good: "border-emerald-800/40 bg-emerald-950/15 hover:border-emerald-700/60 hover:bg-emerald-950/30",
    muted: "border-zinc-800/60 bg-zinc-900/30 hover:border-zinc-700/80",
  };
  const inner = (
    <span className="flex max-w-[14rem] shrink-0 flex-col gap-0.5">
      <span className="truncate font-mono text-[11px] text-zinc-200">{label}</span>
      {sub != null && (
        <span className="truncate font-mono text-[9px] text-zinc-600">{sub}</span>
      )}
    </span>
  );
  const cls =
    "group flex shrink-0 items-center rounded-lg border px-2.5 py-1.5 transition-colors " +
    toneRing[tone];

  if (href) {
    // Chip links go to in-app detail routes (skills). Keep them whole-chip clickable.
    return (
      <a href={href} className={cls} title={title}>
        {inner}
      </a>
    );
  }
  return (
    <span className={cls} title={title}>
      {inner}
    </span>
  );
}
