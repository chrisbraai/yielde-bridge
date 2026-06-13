import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The Claude Agent SDK spawns the bundled `claude` CLI subprocess and loads platform-native
  // binaries — it must run as a real Node dependency, not be bundled into the server build. Keeping
  // it (and better-sqlite3, already native) external avoids broken require() paths at runtime.
  serverExternalPackages: ["@anthropic-ai/claude-agent-sdk", "better-sqlite3"],
};

export default nextConfig;
