import "server-only";
import { spawn } from "node:child_process";
import type { Health, ServiceHealth } from "./types";
import type { CockpitConfig } from "./config";

// Health = external reachability of the live services + optional deploy-drift (is prod behind
// origin/main?). HARD RULES: we only ever GET (never POST/PUT/DELETE), never SSH, never hit a
// mutating endpoint. Service checks use a 4s AbortController timeout. Deploy-drift compares a SHA
// extracted from a configured healthz URL against the local platform clone's origin/main — both
// read-only; any failure degrades deployDrift to null (we don't guess).

const SERVICE_TIMEOUT_MS = 4000;
const HEALTHZ_TIMEOUT_MS = 4000;
const GIT_TIMEOUT_MS = 8000;

async function checkService(svc: ServiceHealth | { name: string; url: string }): Promise<ServiceHealth> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), SERVICE_TIMEOUT_MS);
  const start = Date.now();
  try {
    const res = await fetch(svc.url, {
      method: "GET",
      redirect: "follow",
      signal: controller.signal,
      // No credentials, no caching — this is a liveness probe.
      cache: "no-store",
    });
    const ms = Date.now() - start;
    return {
      name: svc.name,
      url: svc.url,
      // "up" = we reached it AND it isn't a 5xx. 4xx (e.g. an auth wall) still counts as reached.
      up: res.status < 500,
      status: res.status,
      ms,
    };
  } catch {
    const ms = Date.now() - start;
    return { name: svc.name, url: svc.url, up: false, ms };
  } finally {
    clearTimeout(timer);
  }
}

// Pull a 7-40 char hex SHA out of an arbitrary healthz response (JSON field or plain text).
function extractSha(body: string): string | null {
  // Prefer an explicit field if the body is JSON.
  try {
    const j = JSON.parse(body) as Record<string, unknown>;
    for (const key of ["sha", "commit", "gitSha", "git_sha", "revision", "version"]) {
      const v = j[key];
      if (typeof v === "string") {
        const m = v.match(/[0-9a-f]{7,40}/i);
        if (m) return m[0].toLowerCase();
      }
    }
  } catch {
    /* not JSON — fall through to raw scan */
  }
  const m = body.match(/\b[0-9a-f]{7,40}\b/i);
  return m ? m[0].toLowerCase() : null;
}

async function fetchHealthzSha(url: string): Promise<string | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), HEALTHZ_TIMEOUT_MS);
  try {
    const res = await fetch(url, { method: "GET", signal: controller.signal, cache: "no-store" });
    if (res.status >= 500) return null;
    const text = await res.text();
    return extractSha(text);
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

// Read origin/main's SHA from a local clone via `git rev-parse`. Read-only; no fetch/pull.
function gitRevParseOriginMain(clonePath: string): Promise<string | null> {
  return new Promise((resolve) => {
    let child;
    try {
      child = spawn("git", ["-C", clonePath, "rev-parse", "origin/main"], { windowsHide: true });
    } catch {
      resolve(null);
      return;
    }
    let stdout = "";
    let settled = false;
    const finish = (v: string | null) => {
      if (settled) return;
      settled = true;
      resolve(v);
    };
    const timer = setTimeout(() => {
      try {
        child.kill();
      } catch {
        /* ignore */
      }
      finish(null);
    }, GIT_TIMEOUT_MS);
    child.stdout?.on("data", (d) => {
      stdout += d.toString();
    });
    child.on("error", () => {
      clearTimeout(timer);
      finish(null);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code !== 0) {
        finish(null);
        return;
      }
      const sha = stdout.trim().split(/\s+/)[0];
      finish(sha && /^[0-9a-f]{7,40}$/i.test(sha) ? sha.toLowerCase() : null);
    });
  });
}

const EMPTY_HEALTH: Health = { services: [], deployDrift: null };

export async function getHealth(config: CockpitConfig, errors: string[]): Promise<Health> {
  // Service checks in parallel.
  const services = await Promise.all(config.services.map((s) => checkService(s)));

  // Deploy drift — only when a healthz URL is configured.
  let deployDrift: Health["deployDrift"] = null;
  if (config.healthzUrl) {
    try {
      const [prodSha, mainSha] = await Promise.all([
        fetchHealthzSha(config.healthzUrl),
        gitRevParseOriginMain(config.platformClonePath),
      ]);
      if (prodSha && mainSha) {
        // Compare on the shorter common length (healthz may emit a short SHA).
        const len = Math.min(prodSha.length, mainSha.length);
        const behind = prodSha.slice(0, len) !== mainSha.slice(0, len);
        deployDrift = { behind, prodSha, mainSha };
      } else {
        // Couldn't establish both SHAs -> we don't know; leave null (honest).
        deployDrift = null;
        if (!prodSha) errors.push("health: healthz reachable but no SHA extractable");
        if (!mainSha) errors.push("health: could not read origin/main from platform clone");
      }
    } catch (e) {
      deployDrift = null;
      errors.push(`health: deploy-drift check failed (${e instanceof Error ? e.message : e})`);
    }
  }

  return { services, deployDrift };
}

export { EMPTY_HEALTH };
