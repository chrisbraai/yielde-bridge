import type { ReactNode } from "react";

// Small shared building blocks for the Command cockpit. All pure / presentational — props in,
// SVG/markup out, zero data fetching. Kept in one file so the zone panels import a single module.

// ── Kicker: the tiny uppercase mono label that titles every zone ───────────────────────────────

export function Kicker({
  children,
  tone = "muted",
}: {
  children: ReactNode;
  tone?: "muted" | "accent" | "danger";
}) {
  const color =
    tone === "accent"
      ? "text-blue-400/90"
      : tone === "danger"
        ? "text-rose-400/90"
        : "text-zinc-500";
  return (
    <span className={`text-[10px] uppercase tracking-[0.18em] font-mono ${color}`}>
      {children}
    </span>
  );
}

// ── Zone: the consistent panel chrome every quadrant sits in ───────────────────────────────────

export function Zone({
  title,
  titleTone,
  right,
  children,
  className = "",
  bodyClassName = "",
  tone = "default",
}: {
  title?: ReactNode;
  titleTone?: "muted" | "accent" | "danger";
  right?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
  tone?: "default" | "danger" | "good";
}) {
  const ring =
    tone === "danger"
      ? "border-rose-900/50 bg-gradient-to-b from-rose-950/25 to-zinc-950"
      : tone === "good"
        ? "border-emerald-900/40 bg-gradient-to-b from-emerald-950/15 to-zinc-950"
        : "border-zinc-800/80 bg-gradient-to-b from-zinc-900/40 to-zinc-950";
  return (
    <section
      className={`flex min-h-0 flex-col overflow-hidden rounded-xl border ${ring} ${className}`}
    >
      {(title || right) && (
        <header className="flex shrink-0 items-center justify-between px-3.5 pt-3 pb-2">
          {title ? <Kicker tone={titleTone}>{title}</Kicker> : <span />}
          {right}
        </header>
      )}
      <div className={`min-h-0 flex-1 px-3.5 pb-3 ${bodyClassName}`}>{children}</div>
    </section>
  );
}

// ── StatCell: a labelled number, font-mono tabular ─────────────────────────────────────────────

export function StatCell({
  label,
  value,
  sub,
  tone = "default",
  size = "md",
  title,
}: {
  label: ReactNode;
  value: ReactNode;
  sub?: ReactNode;
  tone?: "default" | "good" | "warn" | "danger" | "accent" | "muted";
  size?: "sm" | "md" | "lg";
  title?: string;
}) {
  const valueColor: Record<string, string> = {
    default: "text-zinc-100",
    good: "text-emerald-400",
    warn: "text-amber-400",
    danger: "text-rose-400",
    accent: "text-blue-300",
    muted: "text-zinc-500",
  };
  const valueSize =
    size === "lg" ? "text-2xl" : size === "sm" ? "text-base" : "text-xl";
  return (
    <div className="flex min-w-0 flex-col gap-0.5" title={title}>
      <span className="truncate text-[10px] uppercase tracking-wider font-mono text-zinc-600">
        {label}
      </span>
      <span
        className={`font-mono font-semibold tabular-nums leading-none ${valueSize} ${valueColor[tone]}`}
      >
        {value}
      </span>
      {sub != null && (
        <span className="truncate text-[10px] font-mono text-zinc-600">{sub}</span>
      )}
    </div>
  );
}

// ── Sparkline: inline SVG line over an area gradient, no deps ───────────────────────────────────

export function Sparkline({
  data,
  width = 220,
  height = 40,
  stroke = "#3b82f6",
  fill = "#3b82f6",
  className = "",
  markLast = false,
}: {
  data: number[];
  width?: number;
  height?: number;
  stroke?: string;
  fill?: string;
  className?: string;
  /** draw a dot on the most-recent point */
  markLast?: boolean;
}) {
  const n = data.length;
  const allZero = data.every((d) => d === 0);
  // viewBox keeps it crisp at any rendered size; consumers scale via className width.
  const pad = 2;
  const w = width;
  const h = height;
  const max = Math.max(1, ...data);
  const stepX = n > 1 ? (w - pad * 2) / (n - 1) : 0;
  const y = (v: number) => h - pad - (v / max) * (h - pad * 2);
  const x = (i: number) => pad + i * stepX;

  const points = data.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`);
  const linePath = points.length ? `M${points.join(" L")}` : "";
  const areaPath =
    points.length > 1
      ? `M${x(0).toFixed(1)},${(h - pad).toFixed(1)} L${points.join(" L")} L${x(n - 1).toFixed(1)},${(h - pad).toFixed(1)} Z`
      : "";

  const gid = `spark-${Math.abs(hashStr(`${stroke}-${n}-${width}`))}`;

  return (
    <svg
      viewBox={`0 0 ${w} ${h}`}
      preserveAspectRatio="none"
      className={className}
      role="img"
      aria-hidden
    >
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={fill} stopOpacity={allZero ? 0.04 : 0.28} />
          <stop offset="100%" stopColor={fill} stopOpacity={0} />
        </linearGradient>
      </defs>
      {/* baseline */}
      <line
        x1={pad}
        y1={h - pad}
        x2={w - pad}
        y2={h - pad}
        stroke="#27272a"
        strokeWidth={1}
        vectorEffect="non-scaling-stroke"
      />
      {areaPath && <path d={areaPath} fill={`url(#${gid})`} />}
      {linePath && (
        <path
          d={linePath}
          fill="none"
          stroke={allZero ? "#3f3f46" : stroke}
          strokeWidth={1.5}
          strokeLinejoin="round"
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
        />
      )}
      {markLast && n > 0 && !allZero && (
        <circle cx={x(n - 1)} cy={y(data[n - 1])} r={2.2} fill={stroke} />
      )}
    </svg>
  );
}

function hashStr(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h << 5) - h + s.charCodeAt(i);
  return h;
}

// ── Dot: a status indicator dot (service health, etc.) ─────────────────────────────────────────

export function Dot({
  up,
  size = 8,
  title,
  pulse = false,
}: {
  up: boolean;
  size?: number;
  title?: string;
  pulse?: boolean;
}) {
  return (
    <span
      title={title}
      aria-hidden
      style={{ width: size, height: size }}
      className={
        "inline-block shrink-0 rounded-full " +
        (up
          ? "bg-emerald-400 shadow-[0_0_8px_-1px] shadow-emerald-500/60"
          : "bg-rose-500 shadow-[0_0_8px_-1px] shadow-rose-500/60") +
        (pulse ? " animate-pulse" : "")
      }
    />
  );
}

// ── EmptyLine: the honest empty-state row ──────────────────────────────────────────────────────

export function EmptyLine({ children }: { children: ReactNode }) {
  return (
    <div className="flex h-full items-center justify-center rounded-lg border border-dashed border-zinc-800/80 px-3 py-4 text-center">
      <span className="text-[11px] leading-relaxed font-mono text-zinc-600">{children}</span>
    </div>
  );
}
