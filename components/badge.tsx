import type { ReactNode } from "react";

// Centralized badge component. One shell, six semantic variants. Replaces 8+ inline pill
// clones across Configure / Run / Inspect rooms. Callers that need a domain-specific name
// (TransportBadge, KindBadge, etc.) thinly map their value space to a variant and delegate.

export type BadgeVariant = "success" | "warn" | "danger" | "info" | "accent" | "muted";

export type BadgeSize = "sm" | "md";

const VARIANT_CLASS: Record<BadgeVariant, string> = {
  success: "border-emerald-700/50 bg-emerald-900/20 text-emerald-400",
  warn:    "border-amber-700/50 bg-amber-900/20 text-amber-400",
  danger:  "border-rose-700/50 bg-rose-900/20 text-rose-400",
  info:    "border-blue-700/50 bg-blue-900/20 text-blue-300",
  accent:  "border-purple-700/50 bg-purple-900/20 text-purple-400",
  muted:   "border-zinc-700 bg-zinc-900 text-zinc-400",
};

const SIZE_CLASS: Record<BadgeSize, string> = {
  sm: "px-1.5 py-0.5 text-[10px]",
  md: "px-2 py-0.5 text-xs",
};

export function Badge({
  variant = "muted",
  size = "md",
  title,
  className = "",
  children,
}: {
  variant?: BadgeVariant;
  size?: BadgeSize;
  title?: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <span
      title={title}
      className={`inline-block rounded border font-mono whitespace-nowrap ${SIZE_CLASS[size]} ${VARIANT_CLASS[variant]} ${className}`}
    >
      {children}
    </span>
  );
}
