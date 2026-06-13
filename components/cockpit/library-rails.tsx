import { listAllSkills } from "@/lib/skills";
import { listAgents } from "@/lib/agents";
import { listScripts } from "@/lib/scripts";
import { listCapabilities, isAffirmative } from "@/lib/config";
import { ScrollRail, Chip } from "./scroll-rail";
import { SectionHeader } from "./consistency-board";

// ── Library rails — the "scrollbars" Chris asked for ────────────────────────────────────────────
//
// FOUR horizontal momentum-scroll rails (Skills / Agents / Scripts / Capabilities), each a row of
// compact chips. This is a SERVER component: it reads the FULL lists directly from the existing
// Library readers — listAllSkills (~180), listAgents, listScripts, listCapabilities (affirmative
// only, matching the Capabilities tab). No client JS — horizontal scroll is CSS overflow.
//
// Reused readers (the Library room's own source-of-truth):
//   lib/skills.ts        listAllSkills()    → ~180 installed skills (flat + nested layouts)
//   lib/agents.ts        listAgents()       → operator agents
//   lib/scripts.ts       listScripts()      → deterministic scripts
//   lib/config.ts        listCapabilities() + isAffirmative → what the agent CAN do (cat-G + privileged)
//
// Skill chips link to the existing detail route /library/skills/[category]/[name]. The per-rail
// count is the live length (it will match snapshot.library, which derives from the same readers).

export async function LibraryRails() {
  // Each reader is independent; if one throws we still want the rest. Settle them individually.
  const [skills, agents, scripts, caps] = await Promise.all([
    listAllSkills().catch(() => []),
    listAgents().catch(() => []),
    listScripts().catch(() => []),
    listCapabilities().catch(() => []),
  ]);

  const grantedCaps = caps.filter(isAffirmative);

  return (
    <section className="flex flex-col gap-4">
      <SectionHeader
        kicker="Library"
        title="Everything installed — scroll each rail"
        note="read-only mirror of Yielde OS · chips link where there's depth"
      />

      <ScrollRail
        title="Skills"
        count={skills.length}
        hint="tap → open SKILL.md"
        empty="no skills found under ~/.claude/skills/"
      >
        {skills.map((s) => (
          <Chip
            key={`${s.category}/${s.name}`}
            label={s.name}
            sub={s.category}
            title={s.description || s.name}
            href={`/library/skills/${encodeURIComponent(s.category)}/${encodeURIComponent(s.name)}`}
            tone={s.pinned ? "accent" : "default"}
          />
        ))}
      </ScrollRail>

      <ScrollRail
        title="Agents"
        count={agents.length}
        hint="/operator deploy <name>"
        empty="no operator agents found"
      >
        {agents.map((a) => (
          <Chip
            key={a.name}
            label={a.name}
            sub={`${a.runtime}${a.schedule ? " · cron" : ""}`}
            title={a.description || a.name}
            tone="default"
          />
        ))}
      </ScrollRail>

      <ScrollRail
        title="Scripts"
        count={scripts.length}
        hint="runnable directly, no LLM"
        empty="no scripts found under ~/.claude/scripts/"
      >
        {scripts.map((sc) => (
          <Chip
            key={`${sc.category}/${sc.name}`}
            label={sc.name}
            sub={sc.category}
            title={sc.description ? `${sc.description}\n${sc.command}` : sc.command}
            tone="muted"
          />
        ))}
      </ScrollRail>

      <ScrollRail
        title="Capabilities"
        count={grantedCaps.length}
        hint="what I can do"
        empty="registry.json holds no affirmative capabilities"
      >
        {grantedCaps.map((c) => (
          <Chip
            key={c.name}
            label={c.name}
            sub={
              c.category === "G"
                ? c.status === "active"
                  ? "active"
                  : "installable"
                : c.confirmGate
                  ? "confirm to run"
                  : "ready"
            }
            title={c.why || c.title}
            tone={c.category === "G" && c.status === "active" ? "good" : "default"}
          />
        ))}
      </ScrollRail>
    </section>
  );
}
