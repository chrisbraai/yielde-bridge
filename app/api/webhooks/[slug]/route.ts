import { NextResponse, type NextRequest } from "next/server";
import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { listWebhooks } from "@/lib/config";
import { resolveSecret, SecretResolveError } from "@/lib/secret-resolver";
import {
  insertWebhookDelivery,
  setRetentionLimits,
} from "@/lib/runtime";
import { redactBody } from "@/lib/redaction";
import { dispatchAcceptedDelivery } from "@/lib/dispatcher";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SIG_HEADER_CANDIDATES = [
  "x-signature",
  "x-hub-signature-256",
  "x-yielde-signature",
];

function pickSignature(req: NextRequest): { name: string; value: string } | null {
  for (const name of SIG_HEADER_CANDIDATES) {
    const v = req.headers.get(name);
    if (v) return { name, value: v };
  }
  return null;
}

function stripSha256Prefix(sig: string): string {
  return sig.startsWith("sha256=") ? sig.slice(7) : sig;
}

function timingSafeHexEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  try {
    return timingSafeEqual(Buffer.from(a, "hex"), Buffer.from(b, "hex"));
  } catch {
    return false;
  }
}

function clientIp(req: NextRequest): string | null {
  const xff = req.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0]!.trim();
  return req.headers.get("x-real-ip");
}

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ slug: string }> },
): Promise<NextResponse> {
  const { slug } = await context.params;
  const receivedAt = new Date().toISOString();
  const sourceIp = clientIp(req);

  const bodyBuf = Buffer.from(await req.arrayBuffer());
  const payloadHash = createHash("sha256").update(bodyBuf).digest("hex");

  const { inbound } = await listWebhooks();
  // Push current retention map down so insert-time pruning honours per-slug overrides.
  setRetentionLimits(
    new Map(
      inbound
        .filter((h) => typeof h.retentionLimit === "number" && h.retentionLimit! > 0)
        .map((h) => [h.slug, h.retentionLimit!]),
    ),
  );

  const hook = inbound.find((w) => w.slug === slug);
  if (!hook) {
    insertWebhookDelivery({
      slug,
      receivedAt,
      sourceIp,
      payloadHash,
      status: "rejected",
      httpCode: 404,
      reason: "no matching inbound slug in webhook.json",
      body: null,
    });
    return NextResponse.json({ error: "unknown webhook slug" }, { status: 404 });
  }

  if (hook.verifySig === "hmac-sha256") {
    const sig = pickSignature(req);
    if (!sig) {
      insertWebhookDelivery({
        slug,
        receivedAt,
        sourceIp,
        payloadHash,
        status: "rejected",
        httpCode: 401,
        reason: `missing signature header (expected one of ${SIG_HEADER_CANDIDATES.join(", ")})`,
        body: null,
      });
      return NextResponse.json({ error: "missing signature header" }, { status: 401 });
    }

    let secret: string;
    try {
      secret = await resolveSecret(hook.secretRef);
    } catch (err) {
      const reason =
        err instanceof SecretResolveError
          ? `secret resolve failed: ${err.message}`
          : `secret resolve failed: ${(err as Error).message}`;
      insertWebhookDelivery({
        slug,
        receivedAt,
        sourceIp,
        payloadHash,
        status: "error",
        httpCode: 503,
        reason,
        body: null,
      });
      return NextResponse.json({ error: "signing secret unavailable" }, { status: 503 });
    }

    const expected = createHmac("sha256", secret).update(bodyBuf).digest("hex");
    const provided = stripSha256Prefix(sig.value).toLowerCase();

    if (!timingSafeHexEqual(provided, expected)) {
      insertWebhookDelivery({
        slug,
        receivedAt,
        sourceIp,
        payloadHash,
        status: "rejected",
        httpCode: 401,
        reason: `signature mismatch via ${sig.name}`,
        body: null,
      });
      return NextResponse.json({ error: "signature mismatch" }, { status: 401 });
    }
  }

  // Apply per-slug redaction BEFORE persisting body_blob. Raw body never touches disk if a
  // redaction rule matched. Hash already computed over the unredacted body so signatures stay
  // verifiable but the stored copy is safe to replay.
  const redaction = redactBody(bodyBuf, hook.redactionRules);
  const storedBody = redaction.body;
  const reasonPrefix = redaction.applied
    ? `dispatch intent: ${hook.targetSkill} · redacted: ${redaction.notes.join(",")}`
    : `dispatch intent: ${hook.targetSkill}`;

  const deliveryId = insertWebhookDelivery({
    slug,
    receivedAt,
    sourceIp,
    payloadHash,
    status: "accepted",
    httpCode: 202,
    reason: reasonPrefix,
    body: storedBody,
    redactionApplied: redaction.applied,
  });

  const dispatch = await dispatchAcceptedDelivery({
    deliveryId,
    slug,
    targetSkill: hook.targetSkill,
    payloadHash,
    receivedAt,
    bodyPath: null,
    bodyBytes: storedBody?.length ?? 0,
  });

  return NextResponse.json(
    {
      received: true,
      slug,
      target_skill: hook.targetSkill,
      payload_hash: payloadHash,
      delivery_id: deliveryId,
      dispatch: {
        status: dispatch.status,
        run_id: dispatch.runId,
        log: dispatch.log,
      },
      redacted: redaction.applied,
    },
    { status: 202 },
  );
}
