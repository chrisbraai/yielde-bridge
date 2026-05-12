import { listHermesPendingDrafts } from "@/lib/hermes-pending";
import { Badge } from "@/components/badge";
import { RegistryHeader } from "@/components/registry-header";
import { fmtTimestamp } from "@/lib/time";

export const dynamic = "force-dynamic";

export default async function HermesPendingPage() {
  const drafts = await listHermesPendingDrafts();

  return (
    <div>
      <RegistryHeader
        title="Hermes pending"
        count={drafts.length}
        source="yielde-skills/_pending/"
        hint="drafts from import-hermes --bulk · promote via `import-hermes.mjs --promote <name> --operator chris` (Chris-only curator gate)"
      />

      {drafts.length === 0 ? (
        <div className="border border-zinc-800 rounded-lg p-10 text-center bg-zinc-950">
          <div className="text-sm text-zinc-400">No pending Hermes drafts.</div>
          <div className="text-xs text-zinc-600 mt-2 max-w-xl mx-auto">
            Run{" "}
            <code className="text-zinc-500">
              node yielde-skills/scripts/import-hermes.mjs --bulk [--filter S] [--limit N]
            </code>{" "}
            to pull drafts from <code className="text-zinc-500">NousResearch/hermes-agent</code>{" "}
            (or another repo) into{" "}
            <code className="text-zinc-500">yielde-skills/_pending/&lt;name&gt;/SKILL.md</code>.
            They land here for review; promotion to{" "}
            <code className="text-zinc-500">skills/hermes/</code> stays Chris-gated.
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          {drafts.map((d) => (
            <div
              key={d.path}
              className="border border-zinc-800 rounded-lg bg-zinc-950 p-4"
            >
              <div className="flex items-baseline justify-between gap-4 flex-wrap">
                <div className="flex items-baseline gap-3 flex-wrap">
                  <code className="text-sm text-zinc-200 font-mono">{d.name}</code>
                  <span className="text-xs text-zinc-600">
                    imported {d.importedAt ? fmtTimestamp(d.importedAt) : "—"}
                  </span>
                  {d.shadowsExistingLive ? (
                    <Badge variant="warn" size="sm">shadows existing</Badge>
                  ) : (
                    <Badge variant="info" size="sm">new</Badge>
                  )}
                </div>
                <code className="text-[11px] text-zinc-600 font-mono">{d.importedFrom ?? ""}</code>
              </div>

              {d.description ? (
                <p className="text-xs text-zinc-400 mt-2">{d.description}</p>
              ) : null}

              {d.tags.length > 0 ? (
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {d.tags.map((t) => (
                    <Badge key={t} variant="muted" size="sm">{t}</Badge>
                  ))}
                </div>
              ) : null}

              {d.bodyPreview ? (
                <p className="text-xs text-zinc-500 mt-3 leading-relaxed">{d.bodyPreview}</p>
              ) : null}

              <div className="text-[11px] text-zinc-600 mt-3 font-mono">
                approve: <span className="text-zinc-400">
                  node yielde-skills/scripts/import-hermes.mjs --promote {d.name} --operator chris
                </span>
              </div>
            </div>
          ))}
        </div>
      )}

      <p className="text-xs text-zinc-600 mt-6">
        The <code className="text-zinc-500">--operator chris</code> flag is a deliberate
        curator gate — Bridge surfaces drafts read-only and never promotes them itself.
        Promotion stamps a fresh{" "}
        <code className="text-zinc-500">imported_at</code> and writes to{" "}
        <code className="text-zinc-500">skills/hermes/&lt;name&gt;/SKILL.md</code>.
      </p>
    </div>
  );
}
