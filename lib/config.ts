import "server-only";
import { join } from "node:path";
import { homedir } from "node:os";
import { readJsonOrDefault } from "./json-io";

/**
 * Config root resolution:
 * 1. YIELDE_BRIDGE_CONFIG_ROOT env var if set
 * 2. ~/yielde-bridge-config (sibling of yielde-bridge)
 *
 * Bridge READS this directory. It never writes. Mutations go through scripts/bridge.mjs + git.
 */
export function configRoot(): string {
  if (process.env.YIELDE_BRIDGE_CONFIG_ROOT) return process.env.YIELDE_BRIDGE_CONFIG_ROOT;
  return join(homedir(), "yielde-bridge-config");
}

/**
 * Capability registry lives in ~/.claude/os/capabilities/registry.json — sourced directly,
 * not mirrored. Single source of truth.
 */
export function capabilitiesRegistryPath(): string {
  if (process.env.YIELDE_OS_CAPABILITIES) return process.env.YIELDE_OS_CAPABILITIES;
  return join(homedir(), ".claude", "os", "capabilities", "registry.json");
}

// ---------- Registry shapes (match yielde-bridge-config schema_version 1.0) ----------

export type McpServer = {
  name: string;
  transport: "stdio" | "sse" | "http";
  command?: string;
  args?: string[];
  url?: string;
  envRefs?: string[];
  enabledFor?: Array<"claude-code" | "cursor" | "claude-desktop">;
};

export type ApiConnector = {
  name: string;
  baseUrl: string;
  authRef: string;
  authMethod?: "bearer" | "api-key" | "oauth" | "basic" | "none";
  rateLimit?: { rpm?: number; rpd?: number };
};

export type WebhookInbound = {
  slug: string;
  targetSkill: string;
  secretRef: string;
  verifySig: "hmac-sha256" | "none";
};

export type WebhookOutbound = {
  name: string;
  url: string;
  authRef?: string;
  retryPolicy?: { maxAttempts?: number; backoffMs?: number };
};

export type SecretRef = {
  name: string;
  provider: "infisical" | "os-keychain" | "env" | "gh-secret";
  path: string;
  lastRotated?: string | null;
};

export type Capability = {
  name: string;
  category: string;
  title: string;
  available: boolean;
  hardGate: boolean;
  why?: string;
  refusal?: string;
  escalation?: string;
  lastReviewed?: string | null;
};

// ---------- File shapes (match yielde-bridge-config schema_version 1.0) ----------

type McpFile = {
  schema_version?: string;
  updated?: string;
  servers?: Record<string, Omit<McpServer, "name">>;
};
type ApiFile = {
  schema_version?: string;
  updated?: string;
  connectors?: Record<string, Omit<ApiConnector, "name">>;
};
type WebhookFile = {
  schema_version?: string;
  updated?: string;
  inbound?: Record<string, Omit<WebhookInbound, "slug">>;
  outbound?: Record<string, Omit<WebhookOutbound, "name">>;
};
type SecretRefsFile = {
  schema_version?: string;
  updated?: string;
  refs?: Record<string, Omit<SecretRef, "name">>;
};
type CapabilitiesFile = {
  schema_version?: string;
  capabilities?: Record<
    string,
    {
      category: string;
      available: boolean;
      title: string;
      why?: string;
      refusal?: string;
      escalation?: string;
      hard_gate?: boolean;
      last_reviewed?: string;
    }
  >;
};

// ---------- Listers ----------

export async function listMcpServers(): Promise<McpServer[]> {
  const file = await readJsonOrDefault<McpFile>(join(configRoot(), "mcp.json"), { servers: {} });
  const servers = file.servers ?? {};
  return Object.entries(servers)
    .map(([name, v]) => ({ name, ...v }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export async function listApiConnectors(): Promise<ApiConnector[]> {
  const file = await readJsonOrDefault<ApiFile>(join(configRoot(), "api.json"), { connectors: {} });
  const connectors = file.connectors ?? {};
  return Object.entries(connectors)
    .map(([name, v]) => ({ name, ...v }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export async function listWebhooks(): Promise<{
  inbound: WebhookInbound[];
  outbound: WebhookOutbound[];
}> {
  const file = await readJsonOrDefault<WebhookFile>(join(configRoot(), "webhook.json"), {
    inbound: {},
    outbound: {},
  });
  const inbound = Object.entries(file.inbound ?? {})
    .map(([slug, v]) => ({ slug, ...v }))
    .sort((a, b) => a.slug.localeCompare(b.slug));
  const outbound = Object.entries(file.outbound ?? {})
    .map(([name, v]) => ({ name, ...v }))
    .sort((a, b) => a.name.localeCompare(b.name));
  return { inbound, outbound };
}

export async function listSecretRefs(): Promise<SecretRef[]> {
  const file = await readJsonOrDefault<SecretRefsFile>(join(configRoot(), "secret-refs.json"), {
    refs: {},
  });
  const refs = file.refs ?? {};
  return Object.entries(refs)
    .map(([name, v]) => ({ name, ...v }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export async function listCapabilities(): Promise<Capability[]> {
  const file = await readJsonOrDefault<CapabilitiesFile>(capabilitiesRegistryPath(), {
    capabilities: {},
  });
  const caps = file.capabilities ?? {};
  return Object.entries(caps)
    .map(([name, v]) => ({
      name,
      category: v.category,
      title: v.title,
      available: v.available,
      hardGate: v.hard_gate === true,
      why: v.why,
      refusal: v.refusal,
      escalation: v.escalation,
      lastReviewed: v.last_reviewed ?? null,
    }))
    .sort((a, b) => {
      if (a.category !== b.category) return a.category.localeCompare(b.category);
      return a.name.localeCompare(b.name);
    });
}

/**
 * Tiny summary used by ConfigureNav badges. Single read for all registries to keep nav fast.
 */
export async function registryCounts(): Promise<{
  mcp: number;
  api: number;
  webhooks: number;
  secrets: number;
  capabilities: number;
}> {
  const [mcp, api, wh, refs, caps] = await Promise.all([
    listMcpServers(),
    listApiConnectors(),
    listWebhooks(),
    listSecretRefs(),
    listCapabilities(),
  ]);
  return {
    mcp: mcp.length,
    api: api.length,
    webhooks: wh.inbound.length + wh.outbound.length,
    secrets: refs.length,
    capabilities: caps.length,
  };
}
