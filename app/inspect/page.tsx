import { PhasePlaceholder } from "@/components/phase-placeholder";

export default function InspectPage() {
  return (
    <div className="max-w-7xl mx-auto px-6 py-6">
      <PhasePlaceholder
        title="Inspect"
        phase={4}
        description="Audit + brain draft review surface. Search ~/.claude/os/audit.jsonl, review every yielde-brain/_inbox/ draft with a side-by-side diff, see capability-gate decisions, and inspect skill traces with regression eval scores (Phase 6)."
        features={[
          "Audit log search with faceted filters (agent, capability, outcome, date)",
          "Brain _inbox/ draft list with diff + Promote / Edit / Discard",
          "Brain diff viewer: staged + incoming from origin",
          "Capability decisions log",
          "Skill traces with use count + eval score drift",
        ]}
      />
    </div>
  );
}
