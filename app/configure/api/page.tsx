import { PhasePlaceholder } from "@/components/phase-placeholder";

export default function ApiPage() {
  return (
    <PhasePlaceholder
      title="API Connectors"
      phase={2}
      description="Centralized registry of REST API connectors: base URLs, auth methods, secret references, rate limits. Auto-generated from OpenAPI specs when available."
      features={[
        "Card-grid view per connector with auth status and last-used timestamp",
        "Auth method picker (Bearer / API key / OAuth / Basic / None)",
        "Secret reference linkage (never literals)",
        "Sample request / response panel for verification",
      ]}
    />
  );
}
