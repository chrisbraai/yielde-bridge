"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export type RunPanel = {
  href: string;
  label: string;
  count: number | null;
};

export function RunNavLinks({ panels }: { panels: RunPanel[] }) {
  const pathname = usePathname();
  return (
    <nav className="flex items-center gap-1 overflow-x-auto">
      {panels.map((panel) => {
        const active =
          pathname === panel.href ||
          (panel.href !== "/run" && pathname.startsWith(panel.href + "/")) ||
          (panel.href === "/run" && pathname === "/run");
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
              <span className="ml-1.5 text-xs text-zinc-500 tabular-nums">{panel.count}</span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}
