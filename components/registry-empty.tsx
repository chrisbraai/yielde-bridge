type Props = {
  what: string;
  cli: string;
};

export function RegistryEmpty({ what, cli }: Props) {
  return (
    <div className="border border-zinc-800 rounded-lg p-10 text-center bg-zinc-950">
      <div className="text-sm text-zinc-400 mb-3">No {what} registered yet.</div>
      <div className="text-xs text-zinc-500 mb-2">Add the first one with:</div>
      <code className="inline-block px-3 py-1.5 rounded bg-zinc-900 border border-zinc-800 text-zinc-300 font-mono text-xs">
        {cli}
      </code>
      <div className="text-xs text-zinc-600 mt-4">
        Bridge reads <code className="text-zinc-500">yielde-bridge-config/</code>. All writes go through the CLI + git.
      </div>
    </div>
  );
}
