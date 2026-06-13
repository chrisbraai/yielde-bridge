import "server-only";
import { join } from "node:path";
import { homedir } from "node:os";
import { stat } from "node:fs/promises";
import { readJsonOrDefault, writeJsonAtomic } from "../json-io";

// Cockpit configuration: which repos to track for the build-vs-ship gap, which services to health-
// check, an optional healthz URL for deploy-drift, and the local platform clone used to read
// origin/main's SHA. Lives at ~/.claude/day/data/cockpit-config.json so it sits alongside the Day
// engine's state. BOM-safe via lib/json-io (Chris may edit it by hand from PowerShell, which writes
// a UTF-8 BOM). The default is written to disk on first read so there's a real file to edit.

export type CockpitService = {
  name: string;
  url: string;
};

export type CockpitConfig = {
  repos: string[];
  services: CockpitService[];
  healthzUrl: string | null;
  platformClonePath: string;
};

export const DEFAULT_COCKPIT_CONFIG: CockpitConfig = {
  repos: ["Yielde-dev/yielde-platform", "Yielde-dev/yielde-site"],
  services: [
    { name: "yielde.dev", url: "https://yielde.dev" },
    { name: "demo", url: "https://demo.yielde.dev" },
    { name: "braambos", url: "https://braambosfarm.co.za" },
  ],
  healthzUrl: null,
  platformClonePath: "C:/Users/chris/yielde-platform",
};

export function cockpitConfigPath(): string {
  if (process.env.YIELDE_COCKPIT_CONFIG) return process.env.YIELDE_COCKPIT_CONFIG;
  return join(homedir(), ".claude", "day", "data", "cockpit-config.json");
}

// Coerce an arbitrary on-disk object into a well-formed CockpitConfig, falling back per-field to the
// default. Tolerates partial/hand-edited files without throwing.
function coerce(raw: Partial<CockpitConfig> | null | undefined): CockpitConfig {
  const d = DEFAULT_COCKPIT_CONFIG;
  if (!raw || typeof raw !== "object") return d;

  const repos = Array.isArray(raw.repos)
    ? raw.repos.filter((r): r is string => typeof r === "string" && r.length > 0)
    : d.repos;

  const services = Array.isArray(raw.services)
    ? raw.services
        .filter(
          (s): s is CockpitService =>
            !!s && typeof s === "object" && typeof s.name === "string" && typeof s.url === "string",
        )
        .map((s) => ({ name: s.name, url: s.url }))
    : d.services;

  const healthzUrl =
    typeof raw.healthzUrl === "string" && raw.healthzUrl.length > 0 ? raw.healthzUrl : null;

  const platformClonePath =
    typeof raw.platformClonePath === "string" && raw.platformClonePath.length > 0
      ? raw.platformClonePath
      : d.platformClonePath;

  return {
    repos: repos.length > 0 ? repos : d.repos,
    services: services.length > 0 ? services : d.services,
    healthzUrl,
    platformClonePath,
  };
}

/**
 * Read the cockpit config. On first run (no file yet) writes the default to disk so Chris has a real
 * file to edit, then returns it. Never throws — a malformed file degrades to the default.
 */
export async function getCockpitConfig(): Promise<CockpitConfig> {
  const path = cockpitConfigPath();

  let exists = false;
  try {
    const st = await stat(path);
    exists = st.isFile();
  } catch {
    exists = false;
  }

  if (!exists) {
    // Seed the default so the file is editable. Best-effort: if the write fails (read-only FS in a
    // test, race with another process) we still return the in-memory default.
    try {
      await writeJsonAtomic(path, DEFAULT_COCKPIT_CONFIG);
    } catch {
      /* non-fatal */
    }
    return DEFAULT_COCKPIT_CONFIG;
  }

  const raw = await readJsonOrDefault<Partial<CockpitConfig>>(path, DEFAULT_COCKPIT_CONFIG);
  return coerce(raw);
}
