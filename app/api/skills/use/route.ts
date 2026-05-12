import { recordUse } from "@/lib/usage";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "invalid JSON" }, { status: 400 });
  }
  if (!body || typeof body !== "object" || typeof (body as { name?: unknown }).name !== "string") {
    return Response.json({ error: "expected { name: string }" }, { status: 400 });
  }
  const name = (body as { name: string }).name;
  if (!/^[a-z0-9_-]+$/i.test(name) || name.length > 80) {
    return Response.json({ error: "invalid skill name" }, { status: 400 });
  }
  const updated = await recordUse(name);
  return Response.json({ name, ...updated });
}
