import { PhasePlaceholder } from "@/components/phase-placeholder";

export default function CapabilitiesPage() {
  return (
    <PhasePlaceholder
      title="Capabilities"
      phase={2}
      description="Read-only view of the Yielde OS capability registry (~/.claude/os/capabilities/) — 36 capabilities, 2 hard-gated. Shows which agents and skills request which capabilities and whether they're currently allowed for the active identity."
      features={[
        "Matrix view: agents × capabilities, allow / deny / hard-gate per cell",
        "Click a cell → see the policy that fired",
        "Hard-gated capabilities visually distinguished",
        "Edit mode (Phase 6 only, write-protected)",
      ]}
    />
  );
}
