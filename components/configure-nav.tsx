"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const PANELS = [
  { href: "/configure/mcp", label: "MCP", count: null as number | null },
  { href: "/configure/api", label: "API", count: null },
  { href: "/configure/webhooks", label: "Webhooks", count: null },
  { href: "/configure/skills", label: "Skills", count: null },
  { href: "/configure/secret-refs", label: "Secrets", count: null },
  { href: "/configure/capabilities", label: "Capabilities", count: null },
] as const;

export function ConfigureNav() {
  const pathname = usePathname();
  return (
    <div className="border-b border-zinc-800">
      <div className="max-w-7xl mx-auto px-6">
        <nav className="flex items-center gap-1 overflow-x-auto">
          {PANELS.map((panel) => {
            const active = pathname === panel.href || pathname.startsWith(panel.href + "/");
            return (
              <Link
                key={panel.href}
                href={panel.href}
                className={
                  "px-3 py-2 text-sm border-b-2 transition-colors whitespace-nowrap " +
                  (active
                    ? "border-blue-500 text-zinc-100"
                    : "border-transparent text-zinc-400 hover:text-zinc-100")
                }
              >
                {panel.label}
                {panel.count !== null && (
                  <span className="ml-1.5 text-xs text-zinc-500">{panel.count}</span>
                )}
              </Link>
            );
          })}
        </nav>
      </div>
    </div>
  );
}
