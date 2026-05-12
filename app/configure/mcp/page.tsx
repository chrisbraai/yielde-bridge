import { PhasePlaceholder } from "@/components/phase-placeholder";

export default function McpPage() {
  return (
    <PhasePlaceholder
      title="MCP Servers"
      phase={2}
      description="Card-grid view of every registered MCP server with health dot, latency, tool count, and a Smithery-style one-click [+ Add] flow that resolves npm/GitHub packages and derives client configs (Claude Code, Cursor) from a single mcp.json registry."
      features={[
        "Card grid with status dot (green/amber/red) and last-ping latency",
        "Click a card → drawer with full config + Test connection",
        "[+ Add] resolves a package URL, generates a config block, shows diff, commits to yielde-bridge-config/mcp.json",
        "Per-server enable toggle for claude-code / cursor / claude-desktop",
        "bridge sync derives ~/.claude/settings.json and ~/.cursor/mcp.json from registry",
      ]}
    />
  );
}
