import { listRecentWebhookDeliveries, type WebhookDelivery } from "@/lib/runtime";
import { listWebhooks } from "@/lib/config";
import { RegistryHeader } from "@/components/registry-header";
import {
  WebhookTailLive,
  type StreamedDelivery,
} from "@/components/webhook-tail-live";

export const dynamic = "force-dynamic";

const SEED_COUNT = 50;

function toStreamed(d: WebhookDelivery): StreamedDelivery {
  return {
    id: d.id,
    slug: d.slug,
    received_at: d.received_at,
    source_ip: d.source_ip,
    payload_hash: d.payload_hash,
    status: d.status,
    http_code: d.http_code,
    reason: d.reason,
    dispatch_status: d.dispatch_status,
    dispatch_target: d.dispatch_target,
    dispatch_run_id: d.dispatch_run_id,
    dispatched_at: d.dispatched_at,
    dispatch_log: d.dispatch_log,
    redaction_applied: d.redaction_applied,
  };
}

export default async function WebhookTailPage() {
  const [deliveries, { inbound }] = await Promise.all([
    Promise.resolve(listRecentWebhookDeliveries(SEED_COUNT)),
    listWebhooks(),
  ]);
  const seed = deliveries.map(toStreamed);

  return (
    <div>
      <RegistryHeader
        title="Webhook tail"
        count={deliveries.length}
        source="runtime.db: webhook_deliveries · SSE /api/webhook-stream"
        hint={`${inbound.length} inbound slug${inbound.length === 1 ? "" : "s"} configured · live ~1s · per-slug retention`}
      />
      <WebhookTailLive seed={seed} seedCount={SEED_COUNT} />
    </div>
  );
}
