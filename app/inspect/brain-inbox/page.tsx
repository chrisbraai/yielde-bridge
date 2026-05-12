import Link from "next/link";
import { listBrainInboxDrafts, type BrainDraft } from "@/lib/brain-inbox";
import { Badge, type BadgeVariant } from "@/components/badge";
import { RegistryHeader } from "@/components/registry-header";
import { fmtTimestamp } from "@/lib/time";

export const dynamic = "force-dynamic";

type SearchParams = Promise<{ file?: string }>;

const KIND_VARIANT: Record<string, BadgeVariant> = {
  decision: "info",
  incident: "danger",
  "staff-work": "success",
  "sop-update": "warn",
  "client-update": "accent",
  unknown: "muted",
};

export default async function BrainInboxPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const sp = await searchParams;
  const drafts = await listBrainInboxDrafts();
  const selected = sp.file ? drafts.find((d) => d.filename === sp.file) ?? null : (drafts[0] ?? null);

  return (
    <div>
      <RegistryHeader
        title="Brain inbox"
        count={drafts.length}
        source="yielde-brain/_inbox/"
        hint="read-only · /brain-log promote is Chris-only"
      />

      {drafts.length === 0 ? (
        <div className="border border-zinc-800 rounded-lg p-10 text-center bg-zinc-950">
          <div className="text-sm text-zinc-400">No drafts in _inbox/ yet.</div>
          <div className="text-xs text-zinc-600 mt-2">
            The Stop hook and <code className="text-zinc-500">/brain-log</code> write drafts here. Bridge
            surfaces them; canonical paths stay untouched.
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-[320px_1fr] gap-6">
          <aside className="border border-zinc-800 rounded-lg bg-zinc-950 overflow-hidden self-start">
            <ul className="divide-y divide-zinc-800 max-h-[70vh] overflow-y-auto">
              {drafts.map((d) => {
                const active = selected?.filename === d.filename;
                return (
                  <li key={d.filename}>
                    <Link
                      href={`/inspect/brain-inbox?file=${encodeURIComponent(d.filename)}`}
                      className={
                        "block px-3 py-2.5 text-sm border-l-2 transition-colors " +
                        (active
                          ? "border-blue-500 bg-zinc-900/60"
                          : "border-transparent hover:bg-zinc-900/40")
                      }
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-mono text-zinc-100 truncate" title={d.title}>
                          {d.title}
                        </span>
                        <KindBadge kind={d.kind} />
                      </div>
                      <div className="text-xs text-zinc-500 font-mono mt-1 truncate" title={d.filename}>
                        {d.filename}
                      </div>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </aside>

          {selected ? <DraftView draft={selected} /> : (
            <div className="text-sm text-zinc-500">Select a draft to view its frontmatter and body.</div>
          )}
        </div>
      )}
    </div>
  );
}

function KindBadge({ kind }: { kind: string }) {
  return <Badge variant={KIND_VARIANT[kind] ?? "muted"} size="sm">{kind}</Badge>;
}

function DraftView({ draft }: { draft: BrainDraft }) {
  return (
    <article className="border border-zinc-800 rounded-lg bg-zinc-950 p-5 self-start">
      <header className="mb-4">
        <div className="flex items-center justify-between gap-3 mb-2">
          <h2 className="text-lg font-semibold text-zinc-100">{draft.title}</h2>
          <KindBadge kind={draft.kind} />
        </div>
        <div className="text-xs font-mono text-zinc-500">{draft.filename}</div>
      </header>

      <dl className="grid grid-cols-2 gap-x-6 gap-y-1.5 text-xs font-mono mb-5 border-t border-b border-zinc-800 py-3">
        <MetaRow label="date" value={draft.date} />
        <MetaRow label="author" value={draft.author} />
        <MetaRow label="status" value={draft.status} />
        <MetaRow label="promote_target" value={draft.promoteTarget} />
        <MetaRow label="modified" value={fmtTimestamp(draft.modifiedAt, { stripMillis: true })} />
        <MetaRow label="session" value={draft.session ? draft.session.slice(0, 12) : null} />
        {draft.tags.length > 0 && (
          <div className="col-span-2 flex gap-1.5 flex-wrap mt-1.5">
            {draft.tags.map((t) => (
              <span
                key={t}
                className="px-1.5 py-0.5 text-[10px] rounded border border-zinc-700 bg-zinc-900 text-zinc-400"
              >
                {t}
              </span>
            ))}
          </div>
        )}
      </dl>

      <div className="text-xs uppercase tracking-wide text-zinc-500 mb-2">Body</div>
      <pre className="text-xs text-zinc-300 whitespace-pre-wrap font-mono leading-relaxed bg-zinc-900/40 border border-zinc-800 rounded-md p-3 max-h-[55vh] overflow-y-auto">
        {draft.body.trim()}
      </pre>

      <div className="mt-5 text-xs text-zinc-500">
        Promotion is Chris-only — run{" "}
        <code className="px-1 py-0.5 bg-zinc-900 rounded text-zinc-400">
          /brain-log promote {draft.filename.replace(/\.md$/i, "")}
        </code>{" "}
        from a terminal to move this draft into its canonical brain folder.
      </div>
    </article>
  );
}

function MetaRow({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div className="flex gap-3">
      <span className="text-zinc-500 w-32 shrink-0">{label}</span>
      <span className="text-zinc-300 truncate">{value || <span className="text-zinc-600">—</span>}</span>
    </div>
  );
}
