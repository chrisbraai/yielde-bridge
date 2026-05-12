type Props = {
  title: string;
  phase: number;
  description: string;
  features: string[];
};

export function PhasePlaceholder({ title, phase, description, features }: Props) {
  return (
    <div className="border border-zinc-800 rounded-lg p-8 bg-zinc-950">
      <div className="flex items-baseline gap-3 mb-3">
        <h1 className="text-xl font-semibold text-zinc-100">{title}</h1>
        <span className="text-xs px-2 py-0.5 rounded border border-amber-700/50 bg-amber-900/20 text-amber-400 font-mono">
          Phase {phase}
        </span>
      </div>
      <p className="text-sm text-zinc-400 leading-relaxed mb-5 max-w-3xl">
        {description}
      </p>
      <div className="text-xs uppercase tracking-wide text-zinc-500 mb-2">
        Will ship
      </div>
      <ul className="space-y-1.5">
        {features.map((f) => (
          <li key={f} className="text-sm text-zinc-300 flex items-start gap-2">
            <span className="text-zinc-600 mt-0.5">·</span>
            <span>{f}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
