import { NextResponse } from "next/server";
import { rm, unlink } from "node:fs/promises";
import { join, resolve } from "node:path";
import { skillsRoot } from "@/lib/skills";
import { operatorAgentsRoot } from "@/lib/agents";
import { scriptsRoot } from "@/lib/scripts";
import { capabilitiesRegistryPath } from "@/lib/config";
import { readJsonOrDefault, writeJsonAtomic } from "@/lib/json-io";

const VALID_KINDS = ["skill", "agent", "script", "capability"] as const;
type RemoveKind = (typeof VALID_KINDS)[number];

const NAME_RE = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,150}$/;
const CAT_RE  = /^[A-Za-z0-9][A-Za-z0-9_.-]{0,80}$/;

function assertWithin(childPath: string, rootPath: string): void {
  const root  = resolve(rootPath);
  const child = resolve(childPath);
  if (child !== root && !child.startsWith(root + "/") && !child.startsWith(root + "\\")) {
    throw new Error(`Path outside allowed root: ${child}`);
  }
}

export async function DELETE(req: Request) {
  let body: unknown;
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }

  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "expected object" }, { status: 400 });
  }

  const { kind, name, category, removePath } = body as Record<string, unknown>;

  if (typeof kind !== "string" || !VALID_KINDS.includes(kind as RemoveKind)) {
    return NextResponse.json({ error: "invalid kind" }, { status: 400 });
  }
  if (typeof name !== "string" || !NAME_RE.test(name)) {
    return NextResponse.json({ error: "invalid name" }, { status: 400 });
  }

  try {
    switch (kind as RemoveKind) {
      case "skill": {
        if (typeof category !== "string" || !CAT_RE.test(category)) {
          return NextResponse.json({ error: "invalid category" }, { status: 400 });
        }
        const root = skillsRoot();
        const skillDir = category === "core" ? join(root, name) : join(root, category, name);
        assertWithin(skillDir, root);
        await rm(skillDir, { recursive: true, force: true });
        break;
      }
      case "agent": {
        if (typeof removePath !== "string") {
          return NextResponse.json({ error: "removePath required" }, { status: 400 });
        }
        assertWithin(removePath, operatorAgentsRoot());
        await unlink(resolve(removePath));
        break;
      }
      case "script": {
        if (typeof removePath !== "string") {
          return NextResponse.json({ error: "removePath required" }, { status: 400 });
        }
        assertWithin(removePath, scriptsRoot());
        await unlink(resolve(removePath));
        break;
      }
      case "capability": {
        type RegFile = { capabilities?: Record<string, unknown>; [k: string]: unknown };
        const regPath = capabilitiesRegistryPath();
        const data = await readJsonOrDefault<RegFile>(regPath, {});
        if (data.capabilities) {
          delete data.capabilities[name];
          await writeJsonAtomic(regPath, data);
        }
        break;
      }
    }
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true });
}
