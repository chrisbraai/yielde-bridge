import { NextResponse, type NextRequest } from "next/server";
import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { listWebhooks } from "@/lib/config";
import { resolveSecret, SecretResolveError } from "@/lib/secret-resolver";
import { insertWebhookDelivery } from "@/lib/runtime";

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

  // Phase 3 stops at archive + dispatch intent log. Actual skill invocation is Phase 4.
  insertWebhookDelivery({
    slug,
    receivedAt,
    sourceIp,
    payloadHash,
    status: "accepted",
    httpCode: 202,
    reason: `dispatch intent: ${hook.targetSkill}`,
    body: bodyBuf,
  });

  return NextResponse.json(
    {
      received: true,
      slug,
      target_skill: hook.targetSkill,
      payload_hash: payloadHash,
    },
    { status: 202 },
  );
}
