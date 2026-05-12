import { PhasePlaceholder } from "@/components/phase-placeholder";

export default function SecretRefsPage() {
  return (
    <PhasePlaceholder
      title="Secret references"
      phase={2}
      description="A list of credential NAMES this Bridge knows about, with the storage backend each value lives in (Infisical / OS keychain / .env.local / GitHub secret). Values are never displayed and never logged. Filename uses 'secret-refs' to dodge default file-guard patterns."
      features={[
        "Storage backend per ref (infisical | keychain | env | gh-secret)",
        "Last rotated timestamp (read-only, set by cred-rotation operator)",
        "Used-by list — which MCP servers, API connectors, webhooks reference each",
        "No CRUD on values from Bridge UI by design",
      ]}
    />
  );
}
