import "server-only";
import type { LibrarySummary } from "./types";
import { listAllSkills } from "../skills";
import { listAgents } from "../agents";
import { listScripts } from "../scripts";
import { listCapabilities } from "../config";

// Cheap counts for the cockpit header. Reuses the EXISTING Library readers so the numbers always
// match what the Library room renders. `capabilitiesGranted` mirrors the Capabilities tab's
// affirmative category-G entries (the "granted agentic tooling" — what the agent CAN do, not the
// refusal boundaries).

export const EMPTY_LIBRARY: LibrarySummary = {
  skills: 0,
  agents: 0,
  scripts: 0,
  capabilitiesGranted: 0,
};

export async function getLibrarySummary(): Promise<LibrarySummary> {
  const [skills, agents, scripts, capabilities] = await Promise.all([
    listAllSkills(),
    listAgents(),
    listScripts(),
    listCapabilities(),
  ]);

  // Category G = granted agentic tooling; count the affirmative (available) ones, matching the
  // Capabilities tab's "active + installable" granted view.
  const capabilitiesGranted = capabilities.filter(
    (c) => c.category === "G" && c.available,
  ).length;

  return {
    skills: skills.length,
    agents: agents.length,
    scripts: scripts.length,
    capabilitiesGranted,
  };
}
