type Props = {
  title: string;
  count: number;
  source: string;
  hint?: string;
};

export function RegistryHeader({ title, count, source, hint }: Props) {
  return (
    <header className="mb-6">
      <h1 className="text-xl font-semibold text-zinc-100">{title}</h1>
      <p className="text-sm text-zinc-500 mt-1">
        {count} registered · sourced from{" "}
        <code className="text-zinc-400 text-xs">{source}</code>
        {hint ? <span className="ml-2 text-zinc-600">· {hint}</span> : null}
      </p>
    </header>
  );
}
