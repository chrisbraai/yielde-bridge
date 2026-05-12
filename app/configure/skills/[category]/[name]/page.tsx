import Link from "next/link";
import { notFound } from "next/navigation";
import { readSkill } from "@/lib/skills";
import { renderMarkdown } from "@/lib/markdown";
import { Badge } from "@/components/badge";

export const dynamic = "force-dynamic";

export default async function SkillDetailPage({
  params,
}: {
  params: Promise<{ category: string; name: string }>;
}) {
  const { category, name } = await params;
  const skill = await readSkill(
    decodeURIComponent(category),
    decodeURIComponent(name)
  );
  if (!skill) notFound();

  const fm = skill.frontmatter;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-6">
      <article>
        <Link
          href="/configure/skills"
          className="text-xs text-zinc-500 hover:text-zinc-300 inline-block mb-4"
        >
          ← All skills
        </Link>

        <header className="mb-6">
          <div className="flex items-center gap-2 text-xs text-zinc-500 font-mono mb-1">
            <span>{skill.category}</span>
            <span>/</span>
            <span className="text-zinc-300">{skill.name}</span>
            {fm.pinned && <span className="ml-2">📌 pinned</span>}
          </div>
          <h1 className="text-2xl font-semibold text-zinc-100 font-mono">
            {skill.name}
          </h1>
          <p className="text-zinc-400 mt-2 text-sm leading-relaxed">
            {fm.description}
          </p>
        </header>

        <div
          className="prose-skill"
          dangerouslySetInnerHTML={{ __html: renderMarkdown(skill.body) }}
        />
      </article>

      <aside className="space-y-5">
        <DetailBlock label="Provenance" value={fm.provenance || "unknown"} mono />
        <DetailBlock label="Version" value={fm.version || "0.0.0"} mono />
        <DetailBlock label="License" value={fm.license || "—"} mono />
        <DetailBlock label="Author" value={fm.author || "—"} />

        {fm.platforms && (
          <ChipList label="Platforms" items={fm.platforms} />
        )}
        {fm.tags && fm.tags.length > 0 && (
          <ChipList label="Tags" items={fm.tags} />
        )}
        {fm.related_skills && fm.related_skills.length > 0 && (
          <ChipList label="Related skills" items={fm.related_skills} />
        )}
        {fm.requires_tools && fm.requires_tools.length > 0 && (
          <ChipList label="Requires tools" items={fm.requires_tools} />
        )}
        {fm.requires_capabilities && fm.requires_capabilities.length > 0 && (
          <ChipList
            label="Requires capabilities"
            items={fm.requires_capabilities}
            tone="warn"
          />
        )}

        <div className="pt-3 border-t border-zinc-800">
          <div className="text-xs text-zinc-500 mb-2">Invoke</div>
          <code className="block text-xs font-mono bg-zinc-900 border border-zinc-800 px-2 py-1.5 rounded text-zinc-300">
            /{skill.name}
          </code>
        </div>

        <div>
          <div className="text-xs text-zinc-500 mb-1">Source</div>
          <code className="block text-[10px] font-mono text-zinc-500 leading-tight break-all">
            {skill.path}
          </code>
        </div>
      </aside>
    </div>
  );
}

function DetailBlock({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <div className="text-xs text-zinc-500 mb-1">{label}</div>
      <div className={"text-sm text-zinc-200 " + (mono ? "font-mono" : "")}>{value}</div>
    </div>
  );
}

function ChipList({
  label,
  items,
  tone,
}: {
  label: string;
  items: string[];
  tone?: "warn";
}) {
  return (
    <div>
      <div className="text-xs text-zinc-500 mb-1.5">{label}</div>
      <div className="flex flex-wrap gap-1">
        {items.map((item) => (
          <Badge key={item} variant={tone === "warn" ? "warn" : "muted"} size="sm">
            {item}
          </Badge>
        ))}
      </div>
    </div>
  );
}
