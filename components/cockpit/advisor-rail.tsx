import type { AdvisorState } from "@/lib/cockpit/types";
import { ChatToggle } from "./cockpit-center";

// BOTTOM RAIL — Advisor. Today's directive shown large and quote-like (the one thing), the
// showing-up ritual streak (🔥), the directive status, and the [ chat ▸ ] toggle that flips the
// center stage to the advisor chat. The toggle lives here so the metrics hero stays the default
// focus; pressing it brings the advisor forward without leaving the cockpit.

const STATUS_STYLE: Record<string, { label: string; cls: string }> = {
  done: { label: "done", cls: "border-emerald-700/50 bg-emerald-900/20 text-emerald-400" },
  partial: { label: "partial", cls: "border-amber-700/50 bg-amber-900/20 text-amber-400" },
  missed: { label: "missed", cls: "border-rose-700/50 bg-rose-900/20 text-rose-400" },
  pending: { label: "in focus", cls: "border-zinc-700 bg-zinc-900 text-zinc-400" },
};

export function AdvisorRail({ advisor }: { advisor: AdvisorState }) {
  const status = STATUS_STYLE[advisor.status] ?? STATUS_STYLE.pending;
  const hasDirective = !!advisor.directive;

  return (
    <div className="flex h-full w-full items-center gap-4 px-4">
      {/* streak */}
      <div className="flex shrink-0 flex-col items-center justify-center">
        <div className="flex items-baseline gap-1">
          <span aria-hidden className="text-xl">
            {advisor.streak > 0 ? "🔥" : "·"}
          </span>
          <span className="font-mono text-2xl font-semibold tabular-nums leading-none text-zinc-100">
            {advisor.streak}
          </span>
        </div>
        <span className="mt-0.5 font-mono text-[9px] uppercase tracking-wider text-zinc-600">
          showing up
        </span>
      </div>

      <span className="h-8 w-px shrink-0 bg-zinc-800" />

      {/* directive, quote-like */}
      <div className="flex min-w-0 flex-1 flex-col justify-center">
        <div className="flex items-center gap-2">
          <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-blue-400/80">
            Today&apos;s directive
          </span>
          <span
            className={`rounded border px-1.5 py-0.5 font-mono text-[9px] ${status.cls}`}
          >
            {status.label}
          </span>
        </div>
        {hasDirective ? (
          <p className="mt-0.5 truncate text-[15px] font-medium leading-snug text-zinc-100">
            <span className="mr-1 text-zinc-600">“</span>
            {advisor.directive}
            <span className="ml-0.5 text-zinc-600">”</span>
          </p>
        ) : (
          <p className="mt-0.5 truncate font-mono text-[12px] text-zinc-500">
            no directive yet · run{" "}
            <span className="rounded bg-zinc-900 px-1 text-zinc-300">/day</span> to set today&apos;s
            one thing
          </p>
        )}
        {advisor.sprintMove && (
          <p className="mt-0.5 truncate text-[11px] text-zinc-500" title={advisor.sprintMove}>
            <span className="text-zinc-600">sprint:</span> {advisor.sprintMove}
          </p>
        )}
      </div>

      {/* chat toggle */}
      <span className="shrink-0">
        <ChatToggle />
      </span>
    </div>
  );
}
