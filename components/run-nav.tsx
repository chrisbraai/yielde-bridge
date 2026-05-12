import { listSessions } from "@/lib/sessions";
import { syncOperatorRuns } from "@/lib/operator-runs";
import { listRecentOperatorRuns, listRecentWebhookDeliveries } from "@/lib/runtime";
import { RunNavLinks, type RunPanel } from "./run-nav-links";

export async function RunNav() {
  // Trigger one-shot sync of on-disk operator runs into runtime.db before counting.
  await syncOperatorRuns().catch(() => {
    // Synced lazily on first read; nav must never block on a transient FS error.
  });

  const [sessions, operatorRuns, webhookDeliveries] = await Promise.all([
    listSessions(),
    Promise.resolve(listRecentOperatorRuns(50)),
    Promise.resolve(listRecentWebhookDeliveries(100)),
  ]);

  const activeSessions = sessions.filter((s) => s.status !== "stopped").length;

  const panels: RunPanel[] = [
    { href: "/run", label: "Overview", count: null },
    { href: "/run/sessions", label: "Sessions", count: activeSessions },
    { href: "/run/operator", label: "Operator", count: operatorRuns.length },
    { href: "/run/webhook-tail", label: "Webhooks", count: webhookDeliveries.length },
    { href: "/run/cost", label: "Cost", count: null },
  ];

  return (
    <div className="border-b border-zinc-800">
      <div className="max-w-7xl mx-auto px-6">
        <RunNavLinks panels={panels} />
      </div>
    </div>
  );
}
