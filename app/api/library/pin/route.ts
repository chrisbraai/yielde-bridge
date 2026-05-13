import { NextResponse } from "next/server";
import { togglePin, type PinKind } from "@/lib/pins";

const VALID_KINDS: PinKind[] = ["skill", "agent"];
// Permissive enough for kebab/snake/plugin-style names (`agents-md:cli`, `vercel:bootstrap`)
// but rejects whitespace, slashes, and anything path-like.
const NAME_RE = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,150}$/;

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }

  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "expected object body" }, { status: 400 });
  }

  const { kind, name } = body as { kind?: unknown; name?: unknown };

  if (typeof kind !== "string" || !VALID_KINDS.includes(kind as PinKind)) {
    return NextResponse.json(
      { error: "kind must be 'skill' or 'agent'" },
      { status: 400 }
    );
  }
  if (typeof name !== "string" || !NAME_RE.test(name)) {
    return NextResponse.json({ error: "invalid name" }, { status: 400 });
  }

  const pins = await togglePin(kind as PinKind, name);
  return NextResponse.json({ ok: true, pins });
}
