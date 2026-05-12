import { PhasePlaceholder } from "@/components/phase-placeholder";

export default function WebhooksPage() {
  return (
    <PhasePlaceholder
      title="Webhooks"
      phase={2}
      description="Inbound + outbound webhook registry with signing secrets by reference, handler routing (to /operator agent, skill, or n8n workflow), and a replay store for the last 100 deliveries per hook."
      features={[
        "Inbound: path, signing secret ref, handler routing, last 10 deliveries",
        "Outbound: target URL, retry policy, last 10 sends",
        "Replay button on every delivery row",
        "Full payload archive at ~/.claude/bridge/runtime/webhook-archive/",
      ]}
    />
  );
}
