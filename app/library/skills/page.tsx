import { listAllSkills } from "@/lib/skills";
import { readPins } from "@/lib/pins";
import { LibraryList, type LibraryItem } from "@/components/library-list";
import type { BadgeVariant } from "@/components/badge";

export const dynamic = "force-dynamic";

const PROVENANCE_VARIANT: Record<string, BadgeVariant> = {
  "yielde-native": "success",
  "hermes-import": "info",
  "auto-generated": "warn",
};

export default async function LibrarySkillsPage() {
  const [skills, pins] = await Promise.all([listAllSkills(), readPins()]);
  const pinned = new Set(pins.skills);

  const items: LibraryItem[] = skills.map((s) => {
    const badges: LibraryItem["badges"] = [];
    if (s.provenance && s.provenance !== "unknown") {
      badges.push({
        label: s.provenance,
        variant: PROVENANCE_VARIANT[s.provenance] ?? "muted",
      });
    }
    if (s.pinned) badges.push({ label: "curator-pin", variant: "accent" });
    if ((s.uses ?? 0) > 0) badges.push({ label: `${s.uses} use${s.uses === 1 ? "" : "s"}`, variant: "muted" });
    const category = s.category || "core";
    return {
      name: s.name,
      description: s.description,
      category,
      pinned: pinned.has(s.name),
      badges,
      detailHref: `/library/skills/${encodeURIComponent(category)}/${encodeURIComponent(s.name)}`,
    };
  });

  return (
    <div>
      <header className="mb-6">
        <h1 className="text-xl font-semibold text-zinc-100">Skills</h1>
        <p className="text-sm text-zinc-500 mt-1">
          Every installed skill in <code className="text-zinc-400 text-xs">~/.claude/skills/</code>.
          Click a card to copy its name, the pin to lock it to the top, or “view more →” to open the SKILL.md viewer.
        </p>
      </header>
      <LibraryList items={items} kind="skill" />
    </div>
  );
}
