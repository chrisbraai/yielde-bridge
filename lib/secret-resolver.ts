import "server-only";
import { listSecretRefs, type SecretRef } from "./config";

// Secret resolution is per-request. NEVER cache resolved values across requests.
// Phase 3: env-backed refs work end-to-end. Other providers throw an explicit "not yet wired"
// error so the webhook receiver returns a clean 503 instead of silently passing through.

export class SecretResolveError extends Error {
  constructor(public readonly refName: string, message: string) {
    super(message);
    this.name = "SecretResolveError";
  }
}

export async function resolveSecret(refName: string): Promise<string> {
  const refs = await listSecretRefs();
  const ref = refs.find((r) => r.name === refName);
  if (!ref) {
    throw new SecretResolveError(refName, `no secret-ref named '${refName}' in secret-refs.json`);
  }
  return resolveFrom(ref);
}

function resolveFrom(ref: SecretRef): string {
  switch (ref.provider) {
    case "env": {
      const v = process.env[ref.path];
      if (!v) {
        throw new SecretResolveError(
          ref.name,
          `env var '${ref.path}' not set on this process`,
        );
      }
      return v;
    }
    case "infisical":
    case "os-keychain":
    case "gh-secret":
      throw new SecretResolveError(
        ref.name,
        `provider '${ref.provider}' is not yet wired in Phase 3; configure as 'env' or wait for Phase 4`,
      );
    default:
      throw new SecretResolveError(ref.name, `unknown provider on ref '${ref.name}'`);
  }
}
