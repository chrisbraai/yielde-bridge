import "server-only";
import { join } from "node:path";
import { homedir } from "node:os";
import { readJsonOrDefault, writeJsonAtomic } from "./json-io";

// User-pin overlay for the Library room. Stored in ~/.claude/bridge/pins.json so it
// survives ECC bundle updates and never touches the upstream skill files. Distinct
// from frontmatter `pinned: true` which is curator opt-out (a different concept).

export type PinKind = "skill" | "agent" | "script";
export type Pins = { skills: string[]; agents: string[]; scripts: string[] };

export function pinsPath(): string {
  if (process.env.YIELDE_BRIDGE_PINS) return process.env.YIELDE_BRIDGE_PINS;
  return join(homedir(), ".claude", "bridge", "pins.json");
}

const EMPTY: Pins = { skills: [], agents: [], scripts: [] };

export async function readPins(): Promise<Pins> {
  const raw = await readJsonOrDefault<Partial<Pins>>(pinsPath(), EMPTY);
  return {
    skills: Array.isArray(raw.skills) ? raw.skills.filter((s) => typeof s === "string") : [],
    agents: Array.isArray(raw.agents) ? raw.agents.filter((s) => typeof s === "string") : [],
    scripts: Array.isArray(raw.scripts) ? raw.scripts.filter((s) => typeof s === "string") : [],
  };
}

const KIND_TO_KEY: Record<PinKind, keyof Pins> = {
  skill: "skills",
  agent: "agents",
  script: "scripts",
};

export async function togglePin(kind: PinKind, name: string): Promise<Pins> {
  const pins = await readPins();
  const arr = pins[KIND_TO_KEY[kind]];
  const idx = arr.indexOf(name);
  if (idx >= 0) arr.splice(idx, 1);
  else arr.push(name);
  arr.sort();
  await writePins(pins);
  return pins;
}

async function writePins(pins: Pins): Promise<void> {
  await writeJsonAtomic(pinsPath(), pins);
}
