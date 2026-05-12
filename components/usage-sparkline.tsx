type Props = {
  data: number[];
  width?: number;
  height?: number;
  className?: string;
};

export function UsageSparkline({ data, width = 60, height = 16, className }: Props) {
  if (!data || data.length === 0) {
    return <span className="text-zinc-700 text-xs">—</span>;
  }
  const max = Math.max(...data, 1);
  const stepX = data.length > 1 ? width / (data.length - 1) : 0;
  const points = data
    .map((v, i) => {
      const x = i * stepX;
      const y = height - (v / max) * (height - 2) - 1;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
  const total = data.reduce((a, b) => a + b, 0);
  const hasAny = total > 0;
  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className={className}
      aria-label={`Sparkline showing ${total} uses across ${data.length} days`}
    >
      <polyline
        fill="none"
        stroke={hasAny ? "rgb(96 165 250)" : "rgb(63 63 70)"}
        strokeWidth="1"
        points={points}
      />
    </svg>
  );
}
