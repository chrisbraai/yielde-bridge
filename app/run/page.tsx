import { PhasePlaceholder } from "@/components/phase-placeholder";

export default function RunPage() {
  return (
    <div className="max-w-7xl mx-auto px-6 py-6">
      <PhasePlaceholder
        title="Run"
        phase={3}
        description="Live situational awareness — active Claude Code sessions, /operator queue + recent runs, webhook delivery tail, cron schedule, cost meter. Pulls from ~/.claude/os/sessions.json, ~/.claude/operator/runs/, and the webhook archive in real time."
        features={[
          "Active sessions strip (always visible from every page)",
          "/operator queue + recent runs with cost per run",
          "Webhook delivery tail (last 50) with replay buttons",
          "Schedule: next 5 cron / wakeup fires",
          "Daily cost rollup by provider and agent",
        ]}
      />
    </div>
  );
}
