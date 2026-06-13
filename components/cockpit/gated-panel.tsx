import type { GatedItem, GatedSeverity } from "@/lib/cockpit/types";
import { Zone } from "./primitives";

// LEFT-FAR — Gated on You. The "you are the bottleneck" signal: everything waiting on a Chris
// decision. When more than 3 things are stacked on him, the whole panel goes dark-red — the screen
// is telling him he's the constraint. Empty is the calm, good state.

const SEV_BAR: Record<GatedSeverity, string> = {
  danger: "bg-rose-500",
  warn: "bg-amber-500",
  info: "bg-blue-500",
};
const SEV_TEXT: Record<GatedSeverity, string> = {
  danger: "text-rose-300",
  warn: "text-amber-300",
  info: "text-blue-300",
};

const SOURCE_GLYPH: Record<GatedItem["source"], string> = {
  pr: "⤴",
  capability: "▣",
  manual: "●",
};

export function GatedPanel({ gated }: { gated: GatedItem[] }) {
  const items = gated.slice(0, 7);
  const overloaded = gated.length > 3;
  const hidden = gated.length - items.length;

  return (
    <Zone
      title={`Gated on you · ${gated.length}`}
      titleTone={overloaded ? "danger" : "muted"}
      tone={overloaded ? "danger" : "default"}
      className="h-full"
      right={
        overloaded ? (
          <span className="rounded border border-rose-700/50 bg-rose-900/30 px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wider text-rose-300">
            bottleneck
          </span>
        ) : null
      }
    >
      {gated.length === 0 ? (
        <div className="flex h-full flex-col items-center justify-center gap-1.5 text-center">
          <span className="text-2xl text-emerald-500/70" aria-hidden>
            ✓
          </span>
          <span className="font-mono text-[11px] text-zinc-500">nothing waiting on you</span>
          <span className="font-mono text-[10px] text-zinc-600">the path is clear — build</span>
        </div>
      ) : (
        <ul className="flex h-full flex-col gap-1.5 overflow-hidden">
          {items.map((g, i) => (
            <li
              key={`${g.source}-${i}`}
              className="flex items-start gap-2 rounded-md border border-zinc-800/70 bg-zinc-900/40 px-2 py-1.5"
            >
              <span className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${SEV_BAR[g.severity]}`} />
              <div className="min-w-0 flex-1">
                <div className={`text-[12px] leading-snug ${SEV_TEXT[g.severity]}`}>
                  <span className="mr-1 text-zinc-600" aria-hidden>
                    {SOURCE_GLYPH[g.source]}
                  </span>
                  {g.label}
                </div>
                {g.detail && (
                  <div className="mt-0.5 truncate font-mono text-[10px] text-zinc-600" title={g.detail}>
                    {g.detail}
                  </div>
                )}
              </div>
            </li>
          ))}
          {hidden > 0 && (
            <li className="px-2 font-mono text-[10px] text-zinc-600">+{hidden} more gated</li>
          )}
        </ul>
      )}
    </Zone>
  );
}
