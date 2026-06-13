import "server-only";
import { spawn } from "node:child_process";
import type { BuildShip, PrItem } from "./types";
import {
  readDeployEvents,
  shippedThisWeek,
  daysSinceDeploy,
  deployCadence14,
  leadTimeDays,
} from "./deploy-log";

// Build-vs-ship: how much is BUILT (open PRs across tracked repos) vs SHIPPED (deploy events). The
// PR half shells out to `gh pr list`. KNOWN GOTCHA (see ~/.claude memory
// "gh token shadows keyring"): when $GITHUB_TOKEN is set it can shadow the gh keyring and gh fails
// with "Could not resolve to a Repository". So on ANY gh failure we retry ONCE with GITHUB_TOKEN
// (and GH_TOKEN) stripped from the child env. We never throw — failures are recorded into the
// caller-supplied errors array and the repo contributes zero PRs.

type GhPr = {
  number: number;
  title: string;
  isDraft: boolean;
  createdAt: string;
};

const GH_TIMEOUT_MS = 30000;

type GhResult =
  | { ok: true; stdout: string }
  | { ok: false; reason: string };

function runGh(args: string[], dropToken: boolean): Promise<GhResult> {
  return new Promise((resolve) => {
    const env = { ...process.env };
    if (dropToken) {
      delete env.GITHUB_TOKEN;
      delete env.GH_TOKEN;
    }
    let child;
    try {
      child = spawn("gh", args, { env, windowsHide: true });
    } catch (e) {
      resolve({ ok: false, reason: e instanceof Error ? e.message : String(e) });
      return;
    }

    let stdout = "";
    let stderr = "";
    let settled = false;
    const finish = (r: GhResult) => {
      if (settled) return;
      settled = true;
      resolve(r);
    };

    const timer = setTimeout(() => {
      try {
        child.kill();
      } catch {
        /* ignore */
      }
      finish({ ok: false, reason: `gh timed out after ${GH_TIMEOUT_MS}ms` });
    }, GH_TIMEOUT_MS);

    child.stdout?.on("data", (d) => {
      stdout += d.toString();
    });
    child.stderr?.on("data", (d) => {
      stderr += d.toString();
    });
    child.on("error", (e) => {
      clearTimeout(timer);
      finish({ ok: false, reason: e instanceof Error ? e.message : String(e) });
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code === 0) {
        finish({ ok: true, stdout });
      } else {
        const tail = stderr.trim().split("\n").slice(0, 3).join(" | ");
        finish({ ok: false, reason: tail || `exit ${code}` });
      }
    });
  });
}

/** List open PRs for a repo. Returns null and pushes a string to `errors` on failure. */
async function ghPrList(repo: string, errors: string[]): Promise<GhPr[] | null> {
  const args = [
    "pr",
    "list",
    "-R",
    repo,
    "--state",
    "open",
    "--json",
    "number,title,isDraft,createdAt",
    "--limit",
    "100",
  ];

  // Attempt 1 — normal env.
  let res = await runGh(args, false);
  if (res.ok) {
    try {
      return JSON.parse(res.stdout || "[]") as GhPr[];
    } catch (e) {
      errors.push(`${repo}: failed to parse gh output (${e instanceof Error ? e.message : e})`);
      return null;
    }
  }

  // Attempt 2 — strip the token that may be shadowing the keyring, retry once.
  res = await runGh(args, true);
  if (res.ok) {
    try {
      return JSON.parse(res.stdout || "[]") as GhPr[];
    } catch (e) {
      errors.push(
        `${repo}: failed to parse gh output on retry (${e instanceof Error ? e.message : e})`,
      );
      return null;
    }
  }

  errors.push(`${repo}: gh pr list failed (${res.reason})`);
  return null;
}

function ageDaysOf(createdAt: string, now: Date): number {
  const created = new Date(createdAt).getTime();
  if (Number.isNaN(created)) return 0;
  return Math.max(0, Math.floor((now.getTime() - created) / 86400000));
}

const EMPTY_BUILD_SHIP: BuildShip = {
  builtOpen: 0,
  ready: 0,
  draft: 0,
  oldestDays: 0,
  prs: [],
  shippedThisWeek: 0,
  daysSinceDeploy: null,
  deployCadence14: new Array<number>(14).fill(0),
  leadTimeDays: null,
};

/**
 * Assemble the full BuildShip: open-PR counts from gh across all configured repos, merged with the
 * deploy-log-derived ship metrics. Never throws; records gh failures into `errors`.
 */
export async function getBuildShip(
  repos: string[],
  errors: string[],
  now: Date = new Date(),
): Promise<BuildShip> {
  // --- PR half (one gh call per repo, in parallel) ---
  const prItems: PrItem[] = [];
  let builtOpen = 0;
  let draft = 0;

  const lists = await Promise.all(repos.map((repo) => ghPrList(repo, errors).then((prs) => ({ repo, prs }))));

  for (const { repo, prs } of lists) {
    if (!prs) continue; // failure already recorded
    for (const pr of prs) {
      const ageDays = ageDaysOf(pr.createdAt, now);
      prItems.push({
        repo,
        number: pr.number,
        title: pr.title,
        isDraft: !!pr.isDraft,
        ageDays,
      });
      builtOpen++;
      if (pr.isDraft) draft++;
    }
  }

  prItems.sort((a, b) => b.ageDays - a.ageDays); // oldest-first
  const oldestDays = prItems.length > 0 ? prItems[0]!.ageDays : 0;
  const ready = builtOpen - draft;

  // --- deploy half ---
  let deployEvents = [] as Awaited<ReturnType<typeof readDeployEvents>>;
  try {
    deployEvents = await readDeployEvents();
  } catch (e) {
    errors.push(`deploy-log: ${e instanceof Error ? e.message : String(e)}`);
  }

  return {
    builtOpen,
    ready,
    draft,
    oldestDays,
    prs: prItems.slice(0, 15),
    shippedThisWeek: shippedThisWeek(deployEvents, now),
    daysSinceDeploy: daysSinceDeploy(deployEvents, now),
    deployCadence14: deployCadence14(deployEvents, now),
    leadTimeDays: leadTimeDays(),
  };
}

export { EMPTY_BUILD_SHIP };
